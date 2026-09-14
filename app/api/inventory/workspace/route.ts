import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
  requireInventoryManager,
} from '@/lib/inventory-bridge';
import { offlineQuery } from '@/lib/offline-inventory';
import { env } from 'cloudflare:workers';
import { rebuildMonthlyProductHighlights } from '@/lib/monthly-product';
import {
  invoiceCustomerIsComplete,
  shippingMethodForChannel,
} from '@/lib/invoice-workflow';

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
  void accessToken;
  return toCamel(offlineQuery(table, params));
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

async function decorateProducts(value: unknown) {
  const products = Array.isArray(value) ? (value as JsonRecord[]) : [];
  let metadataRows: JsonRecord[] = [];
  let assetRows: JsonRecord[] = [];
  try {
    const metadataResult = await env.DB.prepare(
      `SELECT product_id AS productId, review_status AS studioStatus,
              finalized_at AS finalizedAt, etsy_listed AS etsyListed,
              updated_by AS studioUpdatedBy, updated_at AS studioUpdatedAt
       FROM inventory_product_metadata`,
    ).all<JsonRecord>();
    metadataRows = metadataResult.results || [];
  } catch {
    // Existing inventory data remains usable while a new metadata migration
    // is being applied. Only newly created products default to draft.
  }
  try {
    const assetResult = await env.DB.prepare(
      `SELECT id, product_id AS productId, asset_kind AS assetKind,
              filename, content_type AS contentType, size_bytes AS sizeBytes,
              is_primary AS isPrimary, created_at AS createdAt
       FROM inventory_product_assets
       ORDER BY created_at ASC`,
    ).all<JsonRecord>();
    assetRows = assetResult.results || [];
  } catch {
    // Legacy Supabase images remain the fallback until this migration exists.
  }
  const metadata = new Map(
    metadataRows.map((row) => [scalarText(row.productId), row]),
  );
  return products.map((product) => {
    const productAssets: JsonRecord[] = assetRows
      .filter((asset) => scalarText(asset.productId) === scalarText(product.id))
      .map((asset) => ({
        ...asset,
        isPrimary: [1, true].includes(asset.isPrimary as boolean | number),
        url:
          '/api/inventory/product-assets?id=' +
          encodeURIComponent(scalarText(asset.id)),
      }));
    const primaryImage = productAssets.find(
      (asset) => asset.assetKind === 'image' && asset.isPrimary === true,
    );
    return {
      ...product,
      studioStatus: scalarText(
        metadata.get(scalarText(product.id))?.studioStatus,
        'final',
      ),
      finalizedAt: metadata.get(scalarText(product.id))?.finalizedAt || null,
      etsyListed: [1, true].includes(
        metadata.get(scalarText(product.id))?.etsyListed as boolean | number,
      ),
      studioUpdatedBy:
        metadata.get(scalarText(product.id))?.studioUpdatedBy || null,
      studioUpdatedAt:
        metadata.get(scalarText(product.id))?.studioUpdatedAt || null,
      studioAssets: productAssets,
      studioPrimaryImageUrl: primaryImage?.url || null,
    };
  });
}

async function saveProductMetadata(
  productId: string,
  values: JsonRecord,
  userId: string | null,
) {
  const current = await env.DB.prepare(
    `SELECT review_status AS reviewStatus, finalized_at AS finalizedAt,
            etsy_listed AS etsyListed, created_at AS createdAt
     FROM inventory_product_metadata WHERE product_id = ?`,
  )
    .bind(productId)
    .first<JsonRecord>();
  const instant = new Date().toISOString();
  const reviewStatus =
    values.studioStatus === 'final' ||
    (values.finalReviewed === true && values.studioStatus !== 'draft')
      ? 'final'
      : values.studioStatus === 'draft' || values.finalReviewed === false
        ? 'draft'
        : scalarText(current?.reviewStatus, 'draft');
  const finalizedAt =
    reviewStatus === 'final'
      ? scalarText(values.finalizedAt).trim() ||
        scalarText(current?.finalizedAt).trim() ||
        instant
      : null;
  const etsyListed =
    typeof values.etsyListed === 'boolean'
      ? values.etsyListed
      : [1, true].includes(current?.etsyListed as boolean | number);
  await env.DB.prepare(
    `INSERT INTO inventory_product_metadata
       (product_id, review_status, finalized_at, etsy_listed, updated_by,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       review_status = excluded.review_status,
       finalized_at = excluded.finalized_at,
       etsy_listed = excluded.etsy_listed,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  )
    .bind(
      productId,
      reviewStatus,
      finalizedAt,
      etsyListed ? 1 : 0,
      userId,
      scalarText(current?.createdAt, instant),
      instant,
    )
    .run();
}

async function decorateExpenses(value: unknown) {
  const expenses = Array.isArray(value) ? (value as JsonRecord[]) : [];
  let metadataRows: JsonRecord[] = [];
  let documentRows: JsonRecord[] = [];
  try {
    const result = await env.DB.prepare(
      `SELECT expense_id AS expenseId, category, recurrence,
              updated_at AS studioUpdatedAt
       FROM inventory_expense_metadata`,
    ).all<JsonRecord>();
    metadataRows = result.results || [];
  } catch {
    // Existing expenses remain visible before the supplemental migration.
  }
  try {
    const result = await env.DB.prepare(
      `SELECT id, relation_id AS relationId, filename,
              content_type AS contentType, size_bytes AS sizeBytes,
              created_at AS createdAt
       FROM business_documents WHERE relation_type = 'expense'
       ORDER BY created_at DESC`,
    ).all<JsonRecord>();
    documentRows = result.results || [];
  } catch {
    // Receipt metadata is optional for legacy expenses.
  }
  const metadata = new Map(
    metadataRows.map((row) => [scalarText(row.expenseId), row]),
  );
  return expenses.map((expense) => {
    const expenseId = scalarText(expense.id);
    const saved = metadata.get(expenseId);
    return {
      ...expense,
      category: scalarText(saved?.category),
      recurrence: scalarText(
        saved?.recurrence,
        expense.isMonthly === true ? 'monthly' : 'none',
      ),
      studioUpdatedAt: saved?.studioUpdatedAt || null,
      documents: documentRows
        .filter((document) => scalarText(document.relationId) === expenseId)
        .map((document) => ({
          ...document,
          url:
            '/api/inventory/expense-documents?id=' +
            encodeURIComponent(scalarText(document.id)),
        })),
    };
  });
}

async function saveExpenseMetadata(
  expenseId: string,
  values: JsonRecord,
  userId: string | null,
) {
  const recurrence = ['monthly', 'yearly'].includes(
    scalarText(values.recurrence),
  )
    ? scalarText(values.recurrence)
    : values.isMonthly === true
      ? 'monthly'
      : 'none';
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO inventory_expense_metadata
       (expense_id, category, recurrence, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(expense_id) DO UPDATE SET
       category = excluded.category,
       recurrence = excluded.recurrence,
       updated_at = excluded.updated_at`,
  )
    .bind(
      expenseId,
      scalarText(values.category).trim() || null,
      recurrence,
      userId,
      now,
      now,
    )
    .run();
}

async function loadInvoices() {
  try {
    const result = await env.DB.prepare(
      `SELECT id, invoice_number AS invoiceNumber, customer_id AS customerId,
              order_key AS orderKey,
              status, issue_date AS issueDate, customer_name AS customerName,
              customer_email AS customerEmail,
              customer_address AS customerAddress, channel, currency,
              items_json AS itemsJson, subtotal_cents AS subtotalCents,
              shipping_cents AS shippingCents, total_cents AS totalCents,
              business_snapshot_json AS businessSnapshotJson, note,
              created_at AS createdAt
       FROM invoices ORDER BY issue_date DESC, created_at DESC LIMIT 150`,
    ).all<JsonRecord>();
    return (result.results || []).map((row) => ({
      ...row,
      items: JSON.parse(scalarText(row.itemsJson, '[]')),
      business: JSON.parse(scalarText(row.businessSnapshotJson, '{}')),
      itemsJson: undefined,
      businessSnapshotJson: undefined,
    }));
  } catch {
    return [];
  }
}

async function loadCustomers() {
  try {
    const result = await env.DB.prepare(
      `SELECT id, name, email, address, note,
              created_at AS createdAt, updated_at AS updatedAt
       FROM customers ORDER BY name COLLATE NOCASE ASC LIMIT 500`,
    ).all<JsonRecord>();
    return result.results || [];
  } catch {
    return [];
  }
}

async function createInvoiceDraft({
  orderKey,
  saleIds,
  order,
  items,
  userId,
}: {
  orderKey: string;
  saleIds: string[];
  order: JsonRecord;
  items: JsonRecord[];
  userId: string | null;
}) {
  const issueDate = scalarText(order.date).slice(0, 10);
  const year = Number(issueDate.slice(0, 4));
  const counter = await env.DB.prepare(
    `INSERT INTO invoice_counters (year, last_number) VALUES (?, 1)
     ON CONFLICT(year) DO UPDATE SET last_number = last_number + 1
     RETURNING last_number AS lastNumber`,
  )
    .bind(year)
    .first<{ lastNumber: number }>();
  if (!counter?.lastNumber) throw new Error('Rechnungsnummer fehlt.');
  const invoiceNumber = `FP-${year}-${String(counter.lastNumber).padStart(4, '0')}`;
  const shippingCents = Math.max(
    0,
    Math.trunc(Number(order.shippingCostCents) || 0),
  );
  const invoiceItems = items.map((item) => ({
    description: scalarText(item.articleName, 'Artikel').slice(0, 240),
    variant: scalarText(item.size).slice(0, 160),
    quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
    unitPriceCents: Math.max(0, Math.trunc(Number(item.salePriceCents) || 0)),
  }));
  const subtotalCents = invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const instant = new Date().toISOString();
  const id = crypto.randomUUID();
  let customerId = scalarText(order.customerId).trim();
  if (order.saveCustomer === true) {
    customerId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO customers
         (id, name, email, address, note, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        customerId,
        scalarText(order.customerName || order.shippingRecipient)
          .trim()
          .slice(0, 200),
        scalarText(order.customerEmail).trim().slice(0, 320) || null,
        scalarText(order.customerAddress).trim().slice(0, 1000),
        scalarText(order.customerNote).trim().slice(0, 1000) || null,
        userId,
        instant,
        instant,
      )
      .run();
  }
  const businessSnapshot = {
    name: 'FormPoesie',
    street: 'Bendhecker Straße 63',
    postalCode: '41236',
    city: 'Mönchengladbach',
    country: 'Deutschland',
    vatId: 'DE325062674',
    taxNote: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    paypal: 'atidam@live.de',
    iban: 'DE11 5002 4024 4662 6752 34',
    bic: 'DEFFDEFFXXX',
    verified: true,
  };
  await env.DB.prepare(
    `INSERT INTO invoices
       (id, invoice_number, customer_id, order_key, source_sale_ids_json, status,
        issue_date, customer_name, customer_email, customer_address,
        channel, currency, items_json, subtotal_cents, shipping_cents,
        total_cents, business_snapshot_json, note, created_by,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      invoiceNumber,
      customerId || null,
      orderKey || null,
      JSON.stringify(saleIds),
      issueDate,
      scalarText(order.customerName || order.shippingRecipient, 'Kundin/Kunde')
        .trim()
        .slice(0, 200),
      scalarText(order.customerEmail).trim().slice(0, 320) || null,
      scalarText(order.customerAddress).trim().slice(0, 1000) || null,
      scalarText(order.channel).slice(0, 80),
      JSON.stringify(invoiceItems),
      subtotalCents,
      shippingCents,
      subtotalCents + shippingCents,
      JSON.stringify(businessSnapshot),
      scalarText(order.note).trim().slice(0, 2000) || null,
      userId,
      instant,
      instant,
    )
    .run();
  return {
    id,
    invoiceNumber,
    customerId,
    status: 'issued',
    issueDate,
    customerName: scalarText(
      order.customerName || order.shippingRecipient,
      'Kundin/Kunde',
    ),
    customerEmail: scalarText(order.customerEmail),
    customerAddress: scalarText(order.customerAddress),
    channel: scalarText(order.channel),
    currency: 'EUR',
    items: invoiceItems,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    business: businessSnapshot,
    note: scalarText(order.note),
  };
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
      products: await decorateProducts(products),
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
    const [products, components, invoices, customers] = await Promise.all([
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
      loadInvoices(),
      loadCustomers(),
    ]);
    return {
      products: await decorateProducts(products),
      components,
      invoices,
      customers,
    };
  }
  if (area === 'markets' || area === 'shelves') {
    const [markets, demands, articles, sales, expenses, products] =
      await Promise.all([
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
        query(
          accessToken,
          'products',
          'select=' +
            encodeURIComponent('*,variants:product_variants(*)') +
            '&deleted_at=is.null&order=name.asc',
        ),
      ]);
    return {
      markets: await classifyMarkets(markets),
      demands,
      articles,
      sales,
      expenses,
      products: await decorateProducts(products),
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
  if (area === 'expenses') {
    const expenses = await query(
      accessToken,
      'other_expenses',
      'select=*&deleted_at=is.null&order=invoice_date.desc',
    );
    return { expenses: await decorateExpenses(expenses) };
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
      otherExpenses: await decorateExpenses(otherExpenses),
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
  if (['sales', 'months', 'expenses', 'trash'].includes(area)) {
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
  if (body.entity === 'other_expenses') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
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
      if (
        body.order?.issueInvoice === true &&
        !invoiceCustomerIsComplete(
          scalarText(body.order?.customerName || body.order?.shippingRecipient),
          scalarText(body.order?.customerAddress),
        )
      )
        return Response.json(
          {
            error:
              'Für eine Rechnung werden Kundenname und Rechnungsanschrift benötigt.',
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
          shipping_method: shippingMethodForChannel(channel),
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
      let invoice: JsonRecord | null = null;
      let invoiceError = '';
      if (body.order?.issueInvoice === true) {
        try {
          invoice = await createInvoiceDraft({
            orderKey,
            saleIds: createdIds,
            order: body.order,
            items: submitted,
            userId: user.id || null,
          });
        } catch (error) {
          invoiceError =
            error instanceof Error
              ? error.message
              : 'Rechnungsentwurf konnte nicht erstellt werden.';
        }
      }
      return Response.json(
        { saved: true, orderKey, createdIds, invoice, invoiceError },
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
    if (body.entity === 'products') {
      const created = Array.isArray(result)
        ? (result[0] as JsonRecord | undefined)
        : undefined;
      if (created?.id != null)
        await saveProductMetadata(
          scalarText(created.id),
          body.values,
          user.id || null,
        );
    }
    if (body.entity === 'other_expenses') {
      const created = Array.isArray(result)
        ? (result[0] as JsonRecord | undefined)
        : undefined;
      if (created?.id != null)
        await saveExpenseMetadata(
          scalarText(created.id),
          body.values,
          user.id || null,
        );
    }
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
  if (body.entity === 'other_expenses') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
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
  const hasProductMetadata =
    body.entity === 'products' &&
    ['studioStatus', 'finalReviewed', 'finalizedAt', 'etsyListed'].some(
      (key) => key in body.values!,
    );
  const hasExpenseMetadata =
    body.entity === 'other_expenses' &&
    ['category', 'recurrence'].some((key) => key in body.values!);
  if (
    (!values || !Object.keys(values).length) &&
    !hasProductMetadata &&
    !hasExpenseMetadata
  )
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
      : values || {};
    const result = Object.keys(values || {}).length
      ? await inventoryFetch(
          accessToken,
          `${body.entity}?id=eq.${encodeURIComponent(String(body.id))}`,
          {
            method: 'PATCH',
            body: JSON.stringify(updateValues),
          },
        )
      : [];
    if (hasProductMetadata)
      await saveProductMetadata(String(body.id), body.values, user.id || null);
    if (hasExpenseMetadata)
      await saveExpenseMetadata(String(body.id), body.values, user.id || null);
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
  if (body.entity === 'other_expenses') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
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
