import { inventorySnapshot } from '@/lib/inventory-snapshot';
import 'server-only';
import { env } from 'cloudflare:workers';

type Row = Record<string, unknown>;

const tables = inventorySnapshot as unknown as Record<string, Row[]>;

export function offlineTable(name: string): Row[] {
  return (tables[name] || []).map((row) => ({ ...row }));
}

async function ensureSnapshotTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_snapshots (
    table_name TEXT PRIMARY KEY, rows_json TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
}

async function storedTable(name: string): Promise<Row[]> {
  await ensureSnapshotTable();
  const stored = await env.DB.prepare('SELECT rows_json AS rowsJson FROM inventory_snapshots WHERE table_name=?')
    .bind(name).first<{ rowsJson: string }>();
  if (stored) return JSON.parse(stored.rowsJson) as Row[];
  const seed = offlineTable(name);
  await saveTable(name, seed);
  return seed;
}

async function saveTable(name: string, rows: Row[]) {
  await ensureSnapshotTable();
  await env.DB.prepare(`INSERT INTO inventory_snapshots (table_name,rows_json,updated_at)
    VALUES (?,?,?) ON CONFLICT(table_name) DO UPDATE SET rows_json=excluded.rows_json,updated_at=excluded.updated_at`)
    .bind(name, JSON.stringify(rows), new Date().toISOString()).run();
}

async function relatedRows(
  table: string,
  row: Row,
  related: Record<string, Row[]> = {},
): Promise<Row> {
  if (table === 'products') {
    const id = String(row.id);
    const designers = related.designers || await storedTable('designers');
    const materials = related.materials || await storedTable('materials');
    const materialFor = (value: unknown) =>
      materials.find((item) => String(item.id) === String(value)) || null;
    return {
      ...row,
      designer:
        designers.find(
          (item) => String(item.id) === String(row.designer_id),
        ) || null,
      filaments: (related.product_filaments || await storedTable('product_filaments'))
        .filter((item) => String(item.product_id) === id)
        .map((item) => ({ ...item, material: materialFor(item.material_id) })),
      variants: (related.product_variants || await storedTable('product_variants'))
        .filter((item) => String(item.product_id) === id)
        .map((item) => ({ ...item, material: materialFor(item.material_id) })),
    };
  }
  if (table === 'sales') {
    return {
      ...row,
      items: (related.sale_items || await storedTable('sale_items')).filter(
        (item) => String(item.sale_id) === String(row.id),
      ),
    };
  }
  if (table === 'articles') {
    return {
      ...row,
      variants: (related.article_variants || await storedTable('article_variants'))
        .filter((item) => String(item.article_id) === String(row.id)),
    };
  }
  return row;
}

export async function offlineQuery(table: string, params = ''): Promise<Row[]> {
  const search = new URLSearchParams(params);
  let rows = await storedTable(table);
  for (const [key, value] of search) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (value === 'is.null') rows = rows.filter((row) => row[key] == null);
    else if (value === 'not.is.null')
      rows = rows.filter((row) => row[key] != null);
    else if (value.startsWith('eq.'))
      rows = rows.filter((row) => String(row[key]) === value.slice(3));
  }
  const order = search.get('order');
  if (order) {
    const [field, direction] = order.split('.');
    rows.sort((a, b) =>
      String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'de') *
      (direction === 'desc' ? -1 : 1),
    );
  }
  const offset = Math.max(0, Number(search.get('offset')) || 0);
  const limit = Math.max(0, Number(search.get('limit')) || rows.length);
  const related: Record<string, Row[]> = {};
  if (table === 'products') {
    const names = ['designers', 'materials', 'product_filaments', 'product_variants'];
    const values = await Promise.all(names.map(storedTable));
    names.forEach((name, index) => { related[name] = values[index]; });
  } else if (table === 'sales') {
    related.sale_items = await storedTable('sale_items');
  } else if (table === 'articles') {
    related.article_variants = await storedTable('article_variants');
  }
  return Promise.all(rows.slice(offset, offset + limit).map((row) => relatedRows(table, row, related)));
}

export async function offlineMutate(path: string, method: string, body: Row): Promise<Row[]> {
  const [table, rawParams = ''] = path.split('?');
  if (table === 'rpc/verkauf_buchen') {
    const sales = await storedTable('sales');
    const operationId = String(body.p_operation_id || '');
    const existing = operationId
      ? sales.find((sale) => String(sale.operation_id || '') === operationId)
      : null;
    if (existing) return [{ sale_id: existing.id, bereits: true }];
    const saleId = Math.max(0, ...sales.map((row) => Number(row.id) || 0)) + 1;
    const createdAt = new Date().toISOString();
    sales.push({
      id: saleId,
      date: body.p_date,
      market_id: body.p_market_id,
      discount_cents: body.p_discount_cents || 0,
      pricing_mode: body.p_pricing_mode || 'ITEMIZED',
      total_price_cents: body.p_total_price_cents ?? null,
      payment_method: body.p_payment_method ?? null,
      note: body.p_note ?? null,
      operation_id: operationId || null,
      created_by: body.p_created_by ?? null,
      created_at: createdAt,
      deleted_at: null,
      is_cancelled: false,
    });
    const saleItems = await storedTable('sale_items');
    let itemId = Math.max(0, ...saleItems.map((row) => Number(row.id) || 0));
    for (const line of Array.isArray(body.p_zeilen) ? body.p_zeilen as Row[] : []) {
      saleItems.push({ id: ++itemId, sale_id: saleId, ...line });
    }
    await saveTable('sales', sales);
    await saveTable('sale_items', saleItems);
    return [{ sale_id: saleId, bereits: false }];
  }
  if (table.startsWith('rpc/'))
    throw new Error('Diese Bestandsaktion wird noch auf den neuen Cloudflare-Speicher übertragen.');
  let rows = await storedTable(table);
  if (method === 'POST') {
    const numericIds = rows.map((row) => Number(row.id)).filter(Number.isFinite);
    const created = {
      id: body.id ?? (numericIds.length ? Math.max(...numericIds) + 1 : 1),
      ...body,
      created_at: body.created_at ?? new Date().toISOString(),
      updated_at: body.updated_at ?? new Date().toISOString(),
    };
    rows.push(created);
    await saveTable(table, rows);
    return [created];
  }
  if (method === 'PATCH') {
    const params = new URLSearchParams(rawParams);
    const id = params.get('id')?.replace(/^eq\./, '');
    const updated: Row[] = [];
    rows = rows.map((row) => {
      if (id != null && String(row.id) !== id) return row;
      const next = { ...row, ...body, updated_at: new Date().toISOString() };
      updated.push(next);
      return next;
    });
    await saveTable(table, rows);
    return updated;
  }
  if (method === 'DELETE') {
    const params = new URLSearchParams(rawParams);
    const id = params.get('id')?.replace(/^eq\./, '');
    const removed = rows.filter((row) => id != null && String(row.id) === id);
    rows = rows.filter((row) => id == null || String(row.id) !== id);
    await saveTable(table, rows);
    return removed;
  }
  throw new Error('Nicht unterstützte Inventaraktion.');
}
