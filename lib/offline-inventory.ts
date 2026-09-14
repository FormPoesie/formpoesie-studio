import { inventorySnapshot } from '@/lib/inventory-snapshot';

type Row = Record<string, unknown>;

const tables = inventorySnapshot as unknown as Record<string, Row[]>;

export function offlineTable(name: string): Row[] {
  return (tables[name] || []).map((row) => ({ ...row }));
}

function relatedRows(table: string, row: Row): Row {
  if (table === 'products') {
    const id = String(row.id);
    const designers = offlineTable('designers');
    const materials = offlineTable('materials');
    const materialFor = (value: unknown) =>
      materials.find((item) => String(item.id) === String(value)) || null;
    return {
      ...row,
      designer:
        designers.find(
          (item) => String(item.id) === String(row.designer_id),
        ) || null,
      filaments: offlineTable('product_filaments')
        .filter((item) => String(item.product_id) === id)
        .map((item) => ({ ...item, material: materialFor(item.material_id) })),
      variants: offlineTable('product_variants')
        .filter((item) => String(item.product_id) === id)
        .map((item) => ({ ...item, material: materialFor(item.material_id) })),
    };
  }
  if (table === 'sales') {
    return {
      ...row,
      items: offlineTable('sale_items').filter(
        (item) => String(item.sale_id) === String(row.id),
      ),
    };
  }
  return row;
}

export function offlineQuery(table: string, params = ''): Row[] {
  const search = new URLSearchParams(params);
  let rows = offlineTable(table);
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
  return rows.slice(offset, offset + limit).map((row) => relatedRows(table, row));
}
