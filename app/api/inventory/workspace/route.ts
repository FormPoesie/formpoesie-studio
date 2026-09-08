import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
  requireInventoryManager,
} from '@/lib/inventory-bridge';
import { env } from 'cloudflare:workers';
import { rebuildMonthlyProductHighlights } from '@/lib/monthly-product';

type JsonRecord = Record<string, unknown>;

const entityFields: Record<string, Set<string>> = {
  products: new Set([
    'name',
    'family_id',
    'designer_id',
    'size',
    'category',
    'image_uri',
    'model_url',
    'commercial_license',
    'print_files',
    'printer',
    'print_minutes',
    'production_cost_cents',
    'filament_grams',
    'stock_quantity',
    'base_stock_quantity',
    'default_price_cents',
    'extra_cost_cents',
    'default_accessories',
    'note',
    'archived_at',
  ]),
  product_variants: new Set([
    'product_id',
    'weight_class_group',
    'name',
    'material_id',
    'grams',
    'waste_grams',
    'size',
    'appearance',
    'quantity',
    'discount_percent',
    'defect_note',
    'production_cost_cents',
    'accessories',
    'extra_cost_cents',
    'image_url',
    'price_cents',
    'printer',
    'print_minutes',
    'position',
  ]),
  product_filaments: new Set([
    'product_id',
    'product_variant_id',
    'material_id',
    'grams',
    'waste_grams',
    'part',
    'printer',
    'print_minutes',
    'stock_quantity',
    'printed_together',
    'position',
  ]),
  product_components: new Set([
    'parent_product_id',
    'parent_variant_id',
    'component_product_id',
    'component_variant_id',
    'quantity',
    'inventory_tracking_mode',
    'color_requirement',
    'slot',
    'consumed_at',
  ]),
  product_accessories: new Set([
    'product_id',
    'product_variant_id',
    'accessory_product_id',
    'accessory_variant_id',
  ]),
  market_demands: new Set([
    'market_id',
    'product_id',
    'product_variant_id',
    'quantity',
    'note',
  ]),
  materials: new Set([
    'name',
    'brand_id',
    'with_spool',
    'price_per_roll_cents',
    'spool_weight_grams',
    'variant',
    'material_type',
    'storage_location_id',
    'quantity',
    'unit',
    'status',
    'note',
  ]),
  markets: new Set(['name', 'location', 'date', 'end_date', 'status']),
  online_sales: new Set([
    'product_id',
    'article_name',
    'size',
    'quantity',
    'date',
    'channel',
    'order_key',
    'printer',
    'print_minutes',
    'print_deadline',
    'filament_material_id',
    'filament_grams',
    'filament_cost_cents',
    'electricity_cost_cents',
    'machine_cost_cents',
    'accessory_cost_cents',
    'license_cost_cents',
    'depreciation_cost_cents',
    'sale_price_cents',
    'shipping_method',
    'shipping_cost_cents',
    'shipping_deadline',
    'shipping_recipient',
    'shipping_label_uri',
    'is_printed',
    'is_shipped',
    'note',
  ]),
  other_expenses: new Set([
    'article_name',
    'vendor',
    'invoice_date',
    'quantity',
    'price_cents',
    'is_monthly',
    'end_date',
    'note',
  ]),
};

const rpcNames = new Set([
  'bestand_buchen',
  'bestand_zurueck_buchen',
  'bestand_auf_markt_buchen',
  'markt_buchen',
  'markt_zurueck_buchen',
  'marktpreis_setzen',
  'verkauf_buchen',
  'versand_buchen',
  'versand_zuruecknehmen',
  'zusammenbauen',
  'verkaufs_bauteile_buchen',
]);

const entitiesWithUpdatedBy = new Set([
  'products',
  'materials',
  'online_sales',
  'other_expenses',
]);

const entitiesWithCreatedBy = new Set([
  'products',
  'materials',
  'online_sales',
  'other_expenses',
  'product_components',
  'product_accessories',
  'market_demands',
]);

const trashableEntities = new Set([
  'products',
  'materials',
  'markets',
  'other_expenses',
]);

function toCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => [
      key.replace(/_([a-z0-9])/g, (_, character: string) =>
        character.toUpperCase(),
      ),
      toCamel(item),
    ]),
  );
}

function toSnake(name: string) {
  return name.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function scalarText(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function safeValues(entity: string, values: JsonRecord) {
  const allowed = entityFields[entity];
  if (!allowed) return null;
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [toSnake(key), value] as const)
      .filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
}

async function inventoryFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(inventoryHeaders(accessToken));
  headers.set('Prefer', 'return=representation');
  if (init?.headers) {
    for (const [key, value] of new Headers(init.headers))
      headers.set(key, value);
  }
  const response = await fetch(INVENTORY_SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers,
  });
  const result = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = result as { message?: string; details?: string } | null;
    throw new Error(
      error?.message ||
        error?.details ||
        'Inventardaten konnten nicht gelesen werden.',
    );
  }
  return toCamel(result);
}

async function query(accessToken: string, table: string, params: string) {
  return inventoryFetch(accessToken, `${table}?${params}`);
}

async function classifyMarkets(value: unknown) {
  const markets = Array.isArray(value) ? (value as JsonRecord[]) : [];
  const result = await env.DB.prepare(
    'SELECT market_id, kind FROM inventory_venue_classifications',
  ).all<{ market_id: string; kind: string }>();
  const saved = new Map(
    (result.results || []).map((row) => [String(row.market_id), row.kind]),
  );
  return markets.map((market) => ({
    ...market,
    venueKind:
      saved.get(String(market.id)) ||
      (/place\s*to\s*be|mietregal|regal/i.test(
        `${typeof market.name === 'string' ? market.name : ''} ${
          typeof market.location === 'string' ? market.location : ''
        }`,
      )
        ? 'shelf'
        : 'market'),
  }));
}

async function loadArea(accessToken: string, area: string, request: Request) {
  if (area === 'products') {
    const [
      products,
      families,
      designers,
      components,
      accessories,
      materials,
      marketArticles,
    ] = await Promise.all([
      query(
        accessToken,
        'products',
        'select=' +
          encodeURIComponent(
            '*,filaments:product_filaments(*,material:materials(*,brand:brands(*))),variants:product_variants(*,material:materials(*,brand:brands(*)))',
          ) +
          '&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'product_families',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'designers',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
      query(accessToken, 'product_components', 'select=*&order=id.asc'),
      query(accessToken, 'product_accessories', 'select=*&order=id.asc').catch(
        () => [],
      ),
      query(
        accessToken,
        'materials',
        'select=' +
          encodeURIComponent('*,brand:brands(*)') +
          '&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'articles',
        'select=' +
          encodeURIComponent(
            'product_id,variants:article_variants(quantity_in_stock)',
          ) +
          '&deleted_at=is.null',
      ),
    ]);
    return {
      products,
      families,
      designers,
      components,
      accessories,
      materials,
      marketArticles,
    };
  }
  if (area === 'materials') {
    const [materials, brands, storageLocations] = await Promise.all([
      query(
        accessToken,
        'materials',
        'select=' +
          encodeURIComponent(
            '*,brand:brands(*),storageLocation:storage_locations(*),locations:material_locations(*,storageLocation:storage_locations(*))',
          ) +
          '&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'brands',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'storage_locations',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
    ]);
    return { materials, brands, storageLocations };
  }
  if (area === 'cash') {
    const [products, components] = await Promise.all([
      query(
        accessToken,
        'products',
        'select=' +
          encodeURIComponent(
            '*,filaments:product_filaments(*,material:materials(*,brand:brands(*))),variants:product_variants(*,material:materials(*,brand:brands(*)))',
          ) +
          '&deleted_at=is.null&archived_at=is.null&order=name.asc',
      ),
      query(accessToken, 'product_components', 'select=*&order=id.asc'),
    ]);
    return { products, components };
  }
  if (area === 'markets' || area === 'shelves') {
    const [markets, demands, articles, sales, expenses] = await Promise.all([
      query(
        accessToken,
        'markets',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
      query(accessToken, 'market_demands', 'select=*&order=id.desc'),
      query(
        accessToken,
        'articles',
        'select=' +
          encodeURIComponent('*,variants:article_variants(*)') +
          '&deleted_at=is.null&order=id.desc',
      ),
      query(
        accessToken,
        'sales',
        'select=' +
          encodeURIComponent('*,items:sale_items(*)') +
          '&deleted_at=is.null&order=date.desc',
      ),
      query(
        accessToken,
        'expenses',
        'select=*&deleted_at=is.null&order=created_at.desc',
      ),
    ]);
    return {
      markets: await classifyMarkets(markets),
      demands,
      articles,
      sales,
      expenses,
    };
  }
  if (area === 'online') {
    const [onlineSales, fulfillmentTasks] = await Promise.all([
      query(
        accessToken,
        'online_sales',
        'select=' +
          encodeURIComponent(
            '*,filaments:online_sale_filaments(*),product:products(category)',
          ) +
          '&deleted_at=is.null&order=date.desc',
      ),
      env.DB.prepare(
        `SELECT id, source_type AS sourceType, source_id AS sourceId,
                sale_id AS saleId, article_variant_id AS articleVariantId,
                article_name AS articleName, variant_name AS variantName,
                venue_name AS venueName, quantity,
                fulfillment_mode AS fulfillmentMode,
                is_printed AS isPrinted, is_shipped AS isShipped,
                sale_date AS saleDate, created_at AS createdAt
         FROM inventory_fulfillment_tasks
         WHERE is_printed = 0 OR is_shipped = 0
         ORDER BY sale_date DESC, created_at DESC`,
      ).all(),
    ]);
    return { onlineSales, fulfillmentTasks: fulfillmentTasks.results || [] };
  }
  if (area === 'sales') {
    const [sales, markets, onlineSales] = await Promise.all([
      query(
        accessToken,
        'sales',
        'select=' +
          encodeURIComponent(
            '*,items:sale_items(*,articleVariant:article_variants!sale_items_article_variant_id_fkey(*,article:articles(*)))',
          ) +
          '&deleted_at=is.null&order=date.desc',
      ),
      query(accessToken, 'markets', 'select=id,name,location,date,end_date'),
      query(
        accessToken,
        'online_sales',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
    ]);
    const highlights = await rebuildMonthlyProductHighlights(accessToken).catch(
      () => [],
    );
    return { sales, markets, onlineSales, highlights };
  }
  if (area === 'months') {
    const [sales, expenses, onlineSales, otherExpenses, markets] =
      await Promise.all([
        query(
          accessToken,
          'sales',
          'select=' +
            encodeURIComponent('*,items:sale_items(*)') +
            '&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'expenses',
          'select=*&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'online_sales',
          'select=*&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'other_expenses',
          'select=*&deleted_at=is.null&order=invoice_date.desc',
        ),
        query(accessToken, 'markets', 'select=id,name,date,end_date'),
      ]);
    const highlights = await rebuildMonthlyProductHighlights(accessToken).catch(
      () => [],
    );
    return {
      sales,
      expenses,
      onlineSales,
      otherExpenses,
      markets,
      highlights,
    };
  }
  if (area === 'trash') {
    const [products, materials, markets, otherExpenses] = await Promise.all([
      query(accessToken, 'products', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'materials', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'markets', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'other_expenses', 'select=*&deleted_at=not.is.null'),
    ]);
    return { products, materials, markets, otherExpenses };
  }
  if (area === 'account') {
    const user = await getInventoryUser(request);
    const profiles = user?.id
      ? await query(
          accessToken,
          'profiles',
          `select=id,name,role&id=eq.${encodeURIComponent(user.id)}`,
        )
      : [];
    return { user, profile: Array.isArray(profiles) ? profiles[0] : null };
  }
  throw new Error('Unbekannter Inventarbereich.');
}

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json(
      { error: 'FormPoesie-Anmeldung erforderlich.' },
      { status: 401 },
    );
  const area = new URL(request.url).searchParams.get('area') || 'products';
  if (['sales', 'months', 'trash'].includes(area)) {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  try {
    return Response.json(await loadArea(accessToken, area, request));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Inventardaten konnten nicht gelesen werden.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    action?: string;
    entity?: string;
    values?: JsonRecord;
    rpc?: string;
    args?: JsonRecord;
    createFulfillment?: boolean;
    order?: JsonRecord;
    items?: JsonRecord[];
  };
  try {
    if (body.action === 'create_online_order') {
      const allowedChannels = new Set([
        'Abholung',
        'eBay',
        'eBay Kleinanzeigen',
        'Vinted',
        'Etsy',
        'Bestellformular',
      ]);
      const channel = scalarText(body.order?.channel).trim();
      const saleDate = scalarText(body.order?.date).trim();
      const submitted = Array.isArray(body.items) ? body.items : [];
      if (!allowedChannels.has(channel))
        return Response.json(
          {
            error:
              'Dieser Verkaufsort ist in der allgemeinen Kasse nicht freigegeben.',
          },
          { status: 400 },
        );
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || !submitted.length)
        return Response.json(
          {
            error:
              'Verkaufsdatum und mindestens ein Artikel sind erforderlich.',
          },
          { status: 400 },
        );

      let orderKey = '';
      const createdIds: string[] = [];
      for (const [index, item] of submitted.entries()) {
        const productId = Number(item.productId);
        const quantity = Math.trunc(Number(item.quantity));
        if (!Number.isInteger(productId) || productId <= 0 || quantity <= 0)
          throw new Error(`Artikel ${index + 1} enthält ungültige Daten.`);
        const values = {
          product_id: productId,
          article_name: scalarText(item.articleName, 'Artikel').trim(),
          size: scalarText(item.size).trim() || null,
          quantity,
          date: saleDate,
          channel,
          ...(orderKey ? { order_key: orderKey } : {}),
          printer:
            scalarText(item.printer || body.order?.printer).trim() || null,
          print_minutes: Math.max(
            0,
            Math.trunc(Number(item.printMinutes) || 0),
          ),
          filament_material_id:
            Number(item.filamentMaterialId) > 0
              ? Number(item.filamentMaterialId)
              : null,
          filament_grams: Math.max(
            0,
            Math.trunc(Number(item.filamentGrams) || 0),
          ),
          filament_cost_cents: Math.max(
            0,
            Math.trunc(Number(item.filamentCostCents) || 0),
          ),
          electricity_cost_cents: Math.max(
            0,
            Math.trunc(Number(item.electricityCostCents) || 0),
          ),
          machine_cost_cents: Math.max(
            0,
            Math.trunc(Number(item.machineCostCents) || 0),
          ),
          accessory_cost_cents: Math.max(
            0,
            Math.trunc(Number(item.accessoryCostCents) || 0),
          ),
          license_cost_cents: 0,
          depreciation_cost_cents: 0,
          sale_price_cents: Math.max(
            0,
            Math.trunc(Number(item.salePriceCents) || 0),
          ),
          shipping_cost_cents:
            index === 0
              ? Math.max(
                  0,
                  Math.trunc(Number(body.order?.shippingCostCents) || 0),
                )
              : 0,
          shipping_method: channel === 'Abholung' ? 'Abholung' : 'Versand',
          shipping_recipient:
            scalarText(body.order?.shippingRecipient).trim() || null,
          is_printed: false,
          is_shipped: false,
          note: scalarText(body.order?.note).trim() || null,
          created_by: user.id || null,
          updated_by: user.id || null,
        };
        const result = await inventoryFetch(accessToken, 'online_sales', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        const created = Array.isArray(result)
          ? (result[0] as JsonRecord | undefined)
          : undefined;
        if (!created?.id)
          throw new Error('Verkaufsposition wurde nicht bestätigt.');
        createdIds.push(scalarText(created.id));
        orderKey = scalarText(created.orderKey || created.order_key, orderKey);
      }
      await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
      return Response.json(
        { saved: true, orderKey, createdIds },
        { status: 201 },
      );
    }
    if (body.rpc) {
      if (!rpcNames.has(body.rpc))
        return Response.json(
          { error: 'Aktion ist nicht freigegeben.' },
          { status: 400 },
        );
      const args = {
        ...body.args,
        ...(body.rpc === 'verkauf_buchen'
          ? { p_created_by: user.id || null }
          : {}),
      };
      const result = await inventoryFetch(accessToken, `rpc/${body.rpc}`, {
        method: 'POST',
        body: JSON.stringify(args),
      });
      if (body.rpc === 'verkauf_buchen') {
        const rpcRows = Array.isArray(result) ? (result as JsonRecord[]) : [];
        const saleId = rpcRows[0]?.saleId;
        const already = rpcRows[0]?.bereits === true;
        if (saleId != null && !already && body.createFulfillment !== false) {
          const submitted = Array.isArray(body.args?.p_zeilen)
            ? (body.args?.p_zeilen as JsonRecord[])
            : [];
          const ids = submitted
            .map((item) => item.article_variant_id)
            .filter((id) => typeof id === 'string' || typeof id === 'number');
          const variants = ids.length
            ? ((await query(
                accessToken,
                'article_variants',
                'select=' +
                  encodeURIComponent('*,article:articles(*)') +
                  `&id=in.(${ids.map((id) => encodeURIComponent(String(id))).join(',')})`,
              )) as JsonRecord[])
            : [];
          const marketRows = await query(
            accessToken,
            'markets',
            `select=id,name&id=eq.${encodeURIComponent(scalarText(body.args?.p_market_id))}`,
          );
          const venueName = Array.isArray(marketRows)
            ? scalarText((marketRows[0] as JsonRecord | undefined)?.name)
            : '';
          const instant = new Date().toISOString();
          const saleIdText = scalarText(saleId);
          const statements = submitted.flatMap((item, index) => {
            const variant = variants.find(
              (row) =>
                scalarText(row.id) === scalarText(item.article_variant_id),
            );
            const article = (variant?.article || {}) as JsonRecord;
            const quantity = Math.max(1, Number(item.quantity || 1));
            const variantIdText = scalarText(
              item.article_variant_id,
              String(index),
            );
            return [
              env.DB.prepare(
                `INSERT OR IGNORE INTO inventory_fulfillment_tasks
                  (id, source_type, source_id, sale_id, article_variant_id,
                   article_name, variant_name, venue_name, quantity,
                   fulfillment_mode, is_printed, is_shipped, sale_date,
                   created_at, updated_at)
                 VALUES (?, 'cash-sale', ?, ?, ?, ?, ?, ?, ?, 'pickup', 0, 0, ?, ?, ?)`,
              ).bind(
                `cash-sale-${saleIdText}-${variantIdText}`,
                `${saleIdText}:${variantIdText}`,
                saleIdText,
                variantIdText,
                scalarText(article.name, 'Verkaufter Artikel'),
                scalarText(variant?.color || variant?.name, 'Standard'),
                venueName || null,
                quantity,
                scalarText(body.args?.p_date, instant.slice(0, 10)),
                instant,
                instant,
              ),
            ];
          });
          if (statements.length) await env.DB.batch(statements);
        }
        await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
      }
      return Response.json({ saved: true, result });
    }
    if (!body.entity || !body.values)
      return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
    const values = safeValues(body.entity, body.values);
    if (!values || !Object.keys(values).length)
      return Response.json(
        { error: 'Keine gültigen Felder.' },
        { status: 400 },
      );
    const createValues = {
      ...values,
      ...(entitiesWithCreatedBy.has(body.entity)
        ? { created_by: user.id || null }
        : {}),
      ...(entitiesWithUpdatedBy.has(body.entity)
        ? { updated_by: user.id || null }
        : {}),
    };
    const result = await inventoryFetch(accessToken, body.entity, {
      method: 'POST',
      body: JSON.stringify(createValues),
    });
    if (body.entity === 'markets') {
      const created = Array.isArray(result)
        ? (result[0] as JsonRecord | undefined)
        : undefined;
      const marketId = created?.id;
      const kind = body.values.venueKind === 'shelf' ? 'shelf' : 'market';
      if (typeof marketId === 'string' || typeof marketId === 'number') {
        const instant = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO inventory_venue_classifications
             (market_id, kind, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(market_id) DO UPDATE SET
             kind = excluded.kind, updated_at = excluded.updated_at`,
        )
          .bind(String(marketId), kind, instant, instant)
          .run();
      }
    }
    return Response.json({ saved: true, result }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    entity?: string;
    id?: number | string;
    values?: JsonRecord;
  };
  if (!body.entity || body.id == null || !body.values)
    return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
  if (body.entity === 'fulfillment_tasks') {
    const allowed = Object.fromEntries(
      Object.entries(body.values).filter(([key]) =>
        ['isPrinted', 'isShipped'].includes(key),
      ),
    );
    if (!Object.keys(allowed).length)
      return Response.json(
        { error: 'Keine gültigen Felder.' },
        { status: 400 },
      );
    const sets = Object.keys(allowed).map((key) =>
      key === 'isPrinted' ? 'is_printed = ?' : 'is_shipped = ?',
    );
    const values = Object.values(allowed).map((value) => (value ? 1 : 0));
    await env.DB.prepare(
      `UPDATE inventory_fulfillment_tasks SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
    )
      .bind(...values, new Date().toISOString(), String(body.id))
      .run();
    return Response.json({ saved: true });
  }
  const values = safeValues(body.entity, body.values);
  if (!values || !Object.keys(values).length)
    return Response.json({ error: 'Keine gültigen Felder.' }, { status: 400 });
  try {
    let previousOnlineSale: JsonRecord | null = null;
    if (body.entity === 'online_sales' && 'isShipped' in body.values) {
      const previous = await query(
        accessToken,
        'online_sales',
        `select=id,is_shipped,product_id&id=eq.${encodeURIComponent(String(body.id))}&limit=1`,
      );
      previousOnlineSale = Array.isArray(previous)
        ? ((previous[0] as JsonRecord | undefined) ?? null)
        : null;
    }
    const updateValues = entitiesWithUpdatedBy.has(body.entity)
      ? { ...values, updated_by: user.id || null }
      : values;
    const result = await inventoryFetch(
      accessToken,
      `${body.entity}?id=eq.${encodeURIComponent(String(body.id))}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updateValues),
      },
    );
    if (body.entity === 'online_sales' && previousOnlineSale) {
      const wasShipped = previousOnlineSale.isShipped === true;
      const isShipped = body.values.isShipped === true;
      if (wasShipped !== isShipped) {
        try {
          let isDigital = false;
          const productId = previousOnlineSale.productId;
          if (productId != null) {
            const products = await query(
              accessToken,
              'products',
              `select=category&id=eq.${encodeURIComponent(scalarText(productId))}&limit=1`,
            );
            const category = Array.isArray(products)
              ? scalarText((products[0] as JsonRecord | undefined)?.category)
              : '';
            isDigital = /stl|digital/i.test(category);
          }
          if (!isDigital) {
            await inventoryFetch(
              accessToken,
              `rpc/${isShipped ? 'versand_buchen' : 'versand_zuruecknehmen'}`,
              {
                method: 'POST',
                body: JSON.stringify({
                  p_operation_id: crypto.randomUUID(),
                  p_sale_id: Number(body.id),
                }),
              },
            );
          }
        } catch (error) {
          await inventoryFetch(
            accessToken,
            `online_sales?id=eq.${encodeURIComponent(String(body.id))}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                is_shipped: wasShipped,
                updated_by: user.id || null,
              }),
            },
          ).catch(() => null);
          throw error;
        }
      }
    }
    if (body.entity === 'markets' && body.values.venueKind) {
      const instant = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO inventory_venue_classifications
           (market_id, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(market_id) DO UPDATE SET
           kind = excluded.kind, updated_at = excluded.updated_at`,
      )
        .bind(
          String(body.id),
          body.values.venueKind === 'shelf' ? 'shelf' : 'market',
          instant,
          instant,
        )
        .run();
    }
    return Response.json({ saved: true, result });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    entity?: string;
    id?: number | string;
    restore?: boolean;
  };
  if (!body.entity || body.id == null || !trashableEntities.has(body.entity))
    return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
  try {
    const result = await inventoryFetch(
      accessToken,
      `${body.entity}?id=eq.${encodeURIComponent(String(body.id))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: body.restore ? null : new Date().toISOString(),
          ...(entitiesWithUpdatedBy.has(body.entity)
            ? { updated_by: user.id || null }
            : {}),
        }),
      },
    );
    return Response.json({ saved: true, result });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Aktion fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}
