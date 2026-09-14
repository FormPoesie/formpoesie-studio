import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryReviewStatus,
  inventoryHeaders,
  readCookie,
  requireInventoryManager,
} from '@/lib/inventory-bridge';
import { env } from 'cloudflare:workers';
import { rebuildMonthlyProductHighlights } from '@/lib/monthly-product';
import {
  invoiceCustomerIsComplete,
  shippingMethodForChannel,
} from '@/lib/invoice-workflow';
import { safeAssetFilename } from '@/lib/product-assets';

type JsonRecord = Record<string, unknown>;

const supportedShippingMethods = new Set([
  'abholung',
  'dhl',
  'hermes',
  'dpd',
  'gls',
  'ups',
  'post',
]);

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
  sales: new Set([
    'date',
    'payment_method',
    'pricing_mode',
    'total_price_cents',
    'discount_cents',
    'note',
    'is_cancelled',
  ]),
  sale_items: new Set([
    'quantity',
    'unit_sale_price_cents',
    'unit_cost_price_cents',
  ]),
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
  'sales',
  'online_sales',
]);

const removableRelationEntities = new Set([
  'product_components',
  'product_accessories',
  'product_filaments',
  'product_variants',
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

const variantCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

function compareProductVariants(left: JsonRecord, right: JsonRecord) {
  const leftPosition =
    left.position == null || left.position === ''
      ? null
      : Number(left.position);
  const rightPosition =
    right.position == null || right.position === ''
      ? null
      : Number(right.position);
  if (
    leftPosition != null &&
    rightPosition != null &&
    Number.isFinite(leftPosition) &&
    Number.isFinite(rightPosition) &&
    leftPosition !== rightPosition
  )
    return leftPosition - rightPosition;
  const label = (row: JsonRecord) =>
    [row.name, row.size, row.appearance]
      .map((value) => scalarText(value).trim())
      .filter(Boolean)
      .join(' ');
  return variantCollator.compare(label(left), label(right));
}

function safeValues(entity: string, values: JsonRecord) {
  const allowed = entityFields[entity];
  if (!allowed) return null;
  const integerWeightTable = ['product_variants', 'product_filaments'].includes(
    entity,
  );
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => {
        const snakeKey = toSnake(key);
        const compatibleValue =
          integerWeightTable && ['grams', 'waste_grams'].includes(snakeKey)
            ? Math.max(0, Math.round(Number(value) || 0))
            : value;
        return [snakeKey, compatibleValue] as const;
      })
      .filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
}

async function saveMeasurementPrecision(
  entity: string,
  rowId: string,
  values: JsonRecord,
) {
  if (!['product_variants', 'product_filaments'].includes(entity)) return;
  const hasGrams = 'grams' in values;
  const hasWasteGrams = 'wasteGrams' in values;
  if (!hasGrams && !hasWasteGrams) return;
  const current = await env.DB.prepare(
    `SELECT grams, waste_grams AS wasteGrams
     FROM inventory_measurement_precision
     WHERE entity_kind = ? AND row_id = ?`,
  )
    .bind(entity, rowId)
    .first<JsonRecord>();
  const grams = hasGrams
    ? Math.max(0, Number(values.grams) || 0)
    : current?.grams == null
      ? null
      : Number(current.grams);
  const wasteGrams = hasWasteGrams
    ? Math.max(0, Number(values.wasteGrams) || 0)
    : current?.wasteGrams == null
      ? null
      : Number(current.wasteGrams);
  await env.DB.prepare(
    `INSERT INTO inventory_measurement_precision
       (entity_kind, row_id, grams, waste_grams, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entity_kind, row_id) DO UPDATE SET
       grams = excluded.grams,
       waste_grams = excluded.waste_grams,
       updated_at = excluded.updated_at`,
  )
    .bind(entity, rowId, grams, wasteGrams, new Date().toISOString())
    .run();
}

async function saveVariantDefectMapping(rowId: string, values: JsonRecord) {
  if (!('defectSourceVariantId' in values)) return;
  const sourceVariantId = scalarText(values.defectSourceVariantId).trim();
  if (!sourceVariantId) {
    await env.DB.prepare(
      'DELETE FROM inventory_variant_defects WHERE variant_id = ?',
    )
      .bind(rowId)
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO inventory_variant_defects
       (variant_id, source_variant_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(variant_id) DO UPDATE SET
       source_variant_id = excluded.source_variant_id,
       updated_at = excluded.updated_at`,
  )
    .bind(rowId, sourceVariantId, new Date().toISOString())
    .run();
}

async function inventoryFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const method = (init?.method || 'GET').toUpperCase();
  const serviceKey = env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
  const usePrivilegedWrite = method !== 'GET' && Boolean(serviceKey);
  const headers = new Headers(
    inventoryHeaders(usePrivilegedWrite ? serviceKey : accessToken),
  );
  if (usePrivilegedWrite && serviceKey) headers.set('apikey', serviceKey);
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

async function decorateProducts(value: unknown) {
  const products = Array.isArray(value) ? (value as JsonRecord[]) : [];
  let metadataRows: JsonRecord[] = [];
  let assetRows: JsonRecord[] = [];
  let measurementRows: JsonRecord[] = [];
  let channelPriceRows: JsonRecord[] = [];
  let variantDefectRows: JsonRecord[] = [];
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
  try {
    const measurementResult = await env.DB.prepare(
      `SELECT entity_kind AS entityKind, row_id AS rowId, grams,
              waste_grams AS wasteGrams
       FROM inventory_measurement_precision`,
    ).all<JsonRecord>();
    measurementRows = measurementResult.results || [];
  } catch {
    // Whole-gram inventory values remain available before the precision table exists.
  }
  try {
    const channelPriceResult = await env.DB.prepare(
      `SELECT entity_kind AS entityKind, row_id AS rowId,
              etsy_price_cents AS etsyPriceCents,
              vinted_price_cents AS vintedPriceCents,
              market_price_cents AS marketPriceCents
       FROM inventory_channel_prices`,
    ).all<JsonRecord>();
    channelPriceRows = channelPriceResult.results || [];
  } catch {
    // The established standard price remains the fallback until the additive
    // channel-price migration is available.
  }
  try {
    const variantDefectResult = await env.DB.prepare(
      `SELECT variant_id AS variantId, source_variant_id AS sourceVariantId
       FROM inventory_variant_defects`,
    ).all<JsonRecord>();
    variantDefectRows = variantDefectResult.results || [];
  } catch {
    // Variants remain editable until the additive defect mapping is available.
  }
  const metadata = new Map(
    metadataRows.map((row) => [scalarText(row.productId), row]),
  );
  const measurements = new Map(
    measurementRows.map((row) => [
      `${scalarText(row.entityKind)}:${scalarText(row.rowId)}`,
      row,
    ]),
  );
  const channelPrices = new Map(
    channelPriceRows.map((row) => [
      `${scalarText(row.entityKind)}:${scalarText(row.rowId)}`,
      row,
    ]),
  );
  const variantDefects = new Map(
    variantDefectRows.map((row) => [scalarText(row.variantId), row]),
  );
  const withChannelPrices = (
    entity: 'products' | 'product_variants',
    row: JsonRecord,
    standardPriceKey: 'defaultPriceCents' | 'priceCents',
  ) => {
    const saved = channelPrices.get(`${entity}:${scalarText(row.id)}`);
    const standardPrice = Number(row[standardPriceKey]) || 0;
    return {
      ...row,
      etsyPriceCents:
        saved?.etsyPriceCents == null
          ? standardPrice
          : Number(saved.etsyPriceCents),
      vintedPriceCents:
        saved?.vintedPriceCents == null
          ? standardPrice
          : Number(saved.vintedPriceCents),
      marketPriceCents:
        saved?.marketPriceCents == null
          ? standardPrice
          : Number(saved.marketPriceCents),
    };
  };
  const withPreciseMeasurements = (entity: string, items: unknown) =>
    (Array.isArray(items) ? (items as JsonRecord[]) : []).map((item) => {
      const precise = measurements.get(`${entity}:${scalarText(item.id)}`);
      if (!precise) return item;
      return {
        ...item,
        ...(precise.grams == null ? {} : { grams: precise.grams }),
        ...(precise.wasteGrams == null
          ? {}
          : { wasteGrams: precise.wasteGrams }),
      };
    });
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
    return withChannelPrices(
      'products',
      {
        ...product,
        variants: withPreciseMeasurements('product_variants', product.variants)
          .map((variant) => ({
            ...withChannelPrices('product_variants', variant, 'priceCents'),
            defectSourceVariantId:
              variantDefects.get(scalarText(variant.id))?.sourceVariantId ||
              null,
          }))
          .sort(compareProductVariants),
        filaments: withPreciseMeasurements(
          'product_filaments',
          product.filaments,
        ),
        studioStatus: inventoryReviewStatus(
          metadata.get(scalarText(product.id))?.studioStatus,
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
      },
      'defaultPriceCents',
    );
  });
}

async function saveChannelPrices(
  entity: string,
  rowId: string,
  values: JsonRecord,
  userId: string | null,
) {
  if (!['products', 'product_variants'].includes(entity)) return;
  const keys = [
    'etsyPriceCents',
    'vintedPriceCents',
    'marketPriceCents',
  ] as const;
  if (!keys.some((key) => key in values)) return;
  const current = await env.DB.prepare(
    `SELECT etsy_price_cents AS etsyPriceCents,
            vinted_price_cents AS vintedPriceCents,
            market_price_cents AS marketPriceCents
     FROM inventory_channel_prices
     WHERE entity_kind = ? AND row_id = ?`,
  )
    .bind(entity, rowId)
    .first<JsonRecord>();
  const price = (key: (typeof keys)[number]) =>
    key in values
      ? Math.max(0, Math.trunc(Number(values[key]) || 0))
      : current?.[key] == null
        ? null
        : Math.max(0, Math.trunc(Number(current[key]) || 0));
  await env.DB.prepare(
    `INSERT INTO inventory_channel_prices
       (entity_kind, row_id, etsy_price_cents, vinted_price_cents,
        market_price_cents, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_kind, row_id) DO UPDATE SET
       etsy_price_cents = excluded.etsy_price_cents,
       vinted_price_cents = excluded.vinted_price_cents,
       market_price_cents = excluded.market_price_cents,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  )
    .bind(
      entity,
      rowId,
      price('etsyPriceCents'),
      price('vintedPriceCents'),
      price('marketPriceCents'),
      userId,
      new Date().toISOString(),
    )
    .run();
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
    'studioStatus' in values
      ? inventoryReviewStatus(values.studioStatus)
      : inventoryReviewStatus(current?.reviewStatus);
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

async function decorateMaterials(value: unknown) {
  const materials = Array.isArray(value) ? (value as JsonRecord[]) : [];
  let imageRows: JsonRecord[] = [];
  try {
    const result = await env.DB.prepare(
      `SELECT id, relation_id AS relationId, filename,
              content_type AS contentType, size_bytes AS sizeBytes,
              created_at AS createdAt
       FROM business_documents
       WHERE relation_type = 'material' AND document_kind = 'image'
       ORDER BY created_at ASC`,
    ).all<JsonRecord>();
    imageRows = result.results || [];
  } catch {
    // Materials remain usable if the optional image storage is unavailable.
  }
  return materials.map((material) => ({
    ...material,
    studioImages: imageRows
      .filter(
        (image) => scalarText(image.relationId) === scalarText(material.id),
      )
      .map((image) => ({
        ...image,
        url:
          '/api/inventory/material-images?id=' +
          encodeURIComponent(scalarText(image.id)),
      })),
  }));
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
  if (area === 'products' || area === 'pricing') {
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
    const productData = {
      products: await decorateProducts(products),
      families,
      designers,
      components,
      accessories,
      materials,
      marketArticles,
    };
    if (area === 'products') return productData;
    const [sales, onlineSales, markets] = await Promise.all([
      query(
        accessToken,
        'sales',
        'select=' +
          encodeURIComponent(
            '*,items:sale_items(*,articleVariant:article_variants!sale_items_article_variant_id_fkey(*,article:articles(*)))',
          ) +
          '&deleted_at=is.null&order=date.desc',
      ),
      query(
        accessToken,
        'online_sales',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
      query(accessToken, 'markets', 'select=id,name,location,date,end_date'),
    ]);
    return { ...productData, sales, onlineSales, markets };
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
    return {
      materials: await decorateMaterials(materials),
      brands,
      storageLocations,
    };
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
    const [onlineSales, fulfillmentTasks, shippingDetails] = await Promise.all([
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
      env.DB.prepare(
        `SELECT source_type AS sourceType, source_id AS sourceId,
                shipping_method AS shippingMethod,
                tracking_number AS trackingNumber
         FROM inventory_shipping_details`,
      ).all<JsonRecord>(),
    ]);
    const detailRows = shippingDetails.results || [];
    const shippingDetail = (sourceType: string, sourceId: unknown) =>
      detailRows.find(
        (detail) =>
          scalarText(detail.sourceType) === sourceType &&
          scalarText(detail.sourceId) === scalarText(sourceId),
      );
    const decoratedOnlineSales = (onlineSales as JsonRecord[]).map((sale) => {
      const detail = shippingDetail('online_sales', sale.id);
      return {
        ...sale,
        shippingMethod: detail?.shippingMethod ?? sale.shippingMethod,
        trackingNumber: detail?.trackingNumber ?? null,
        shippingDetailsSourceType: 'online_sales',
      };
    });
    const taskRows = (fulfillmentTasks.results || []) as JsonRecord[];
    const taskVariantIds = taskRows
      .map((item) => item.articleVariantId)
      .filter((id) => id != null);
    const taskVariants = taskVariantIds.length
      ? ((await query(
          accessToken,
          'article_variants',
          'select=' +
            encodeURIComponent('id,article:articles(product_id)') +
            `&id=in.(${taskVariantIds
              .map((id) => encodeURIComponent(scalarText(id)))
              .join(',')})`,
        )) as JsonRecord[])
      : [];
    const decoratedTasks = taskRows.map((task) => {
      const variant = taskVariants.find(
        (item) => scalarText(item.id) === scalarText(task.articleVariantId),
      );
      return {
        ...task,
        productId: (variant?.article as JsonRecord | undefined)?.productId,
        shippingMethod:
          shippingDetail('fulfillment_tasks', task.id)?.shippingMethod ?? null,
        trackingNumber:
          shippingDetail('fulfillment_tasks', task.id)?.trackingNumber ?? null,
        shippingDetailsSourceType: 'fulfillment_tasks',
      };
    });
    return {
      onlineSales: decoratedOnlineSales,
      fulfillmentTasks: decoratedTasks,
    };
  }
  if (area === 'expenses') {
    const [expenses, marketExpenses, markets] = await Promise.all([
      query(
        accessToken,
        'other_expenses',
        'select=*&deleted_at=is.null&order=invoice_date.desc',
      ),
      query(
        accessToken,
        'expenses',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
      query(accessToken, 'markets', 'select=id,name,location,date,end_date'),
    ]);
    return {
      expenses: await decorateExpenses(expenses),
      marketExpenses,
      markets,
    };
  }
  if (area === 'sales') {
    const [sales, markets, onlineSales, marketExpenses] = await Promise.all([
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
      query(
        accessToken,
        'expenses',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
    ]);
    const highlights = await rebuildMonthlyProductHighlights(accessToken).catch(
      () => [],
    );
    return { sales, markets, onlineSales, marketExpenses, highlights };
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

async function duplicateProduct(
  accessToken: string,
  sourceProductId: string,
  userId: string | null,
) {
  const [
    sourceProducts,
    sourceVariants,
    sourceFilaments,
    sourceComponents,
    sourceAccessories,
  ] = await Promise.all([
    query(
      accessToken,
      'products',
      `select=*&id=eq.${encodeURIComponent(sourceProductId)}&deleted_at=is.null&limit=1`,
    ),
    query(
      accessToken,
      'product_variants',
      `select=*&product_id=eq.${encodeURIComponent(sourceProductId)}&order=position.asc,id.asc`,
    ),
    query(
      accessToken,
      'product_filaments',
      `select=*&product_id=eq.${encodeURIComponent(sourceProductId)}&order=position.asc,id.asc`,
    ),
    query(
      accessToken,
      'product_components',
      `select=*&parent_product_id=eq.${encodeURIComponent(sourceProductId)}&order=id.asc`,
    ),
    query(
      accessToken,
      'product_accessories',
      `select=*&product_id=eq.${encodeURIComponent(sourceProductId)}&order=id.asc`,
    ).catch(() => []),
  ]);
  const source = Array.isArray(sourceProducts)
    ? (sourceProducts[0] as JsonRecord | undefined)
    : undefined;
  if (!source)
    throw new Error('Der zu duplizierende Artikel wurde nicht gefunden.');

  const variantRows = Array.isArray(sourceVariants)
    ? (sourceVariants as JsonRecord[])
    : [];
  const filamentRows = Array.isArray(sourceFilaments)
    ? (sourceFilaments as JsonRecord[])
    : [];
  const preciseResult = await env.DB.prepare(
    `SELECT entity_kind AS entityKind, row_id AS rowId, grams, waste_grams AS wasteGrams
     FROM inventory_measurement_precision
     WHERE (entity_kind = 'product_variants' OR entity_kind = 'product_filaments')`,
  ).all<JsonRecord>();
  const preciseMeasurements = new Map(
    (preciseResult.results || []).map((row) => [
      `${scalarText(row.entityKind)}:${scalarText(row.rowId)}`,
      row,
    ]),
  );
  const copiedChannelPriceResult = await env.DB.prepare(
    `SELECT entity_kind AS entityKind, row_id AS rowId,
            etsy_price_cents AS etsyPriceCents,
            vinted_price_cents AS vintedPriceCents,
            market_price_cents AS marketPriceCents
     FROM inventory_channel_prices
     WHERE (entity_kind = 'products' AND row_id = ?)
        OR entity_kind = 'product_variants'`,
  )
    .bind(sourceProductId)
    .all<JsonRecord>();
  const copiedChannelPrices = new Map(
    (copiedChannelPriceResult.results || []).map((row) => [
      `${scalarText(row.entityKind)}:${scalarText(row.rowId)}`,
      row,
    ]),
  );
  const withPrecision = (entity: string, row: JsonRecord) => {
    const precise = preciseMeasurements.get(`${entity}:${scalarText(row.id)}`);
    return {
      ...row,
      ...(precise?.grams == null ? {} : { grams: precise.grams }),
      ...(precise?.wasteGrams == null
        ? {}
        : { wasteGrams: precise.wasteGrams }),
    };
  };

  const productValues = safeValues('products', {
    ...source,
    name: `${scalarText(source.name, 'Artikel')} – Kopie`,
    stockQuantity: 0,
    baseStockQuantity: 0,
    archivedAt: null,
  });
  if (!productValues)
    throw new Error('Die Artikelkopie konnte nicht vorbereitet werden.');

  let newProductId = '';
  const copiedAssetKeys: string[] = [];
  const copiedVariantIds: string[] = [];
  try {
    const createdProducts = await inventoryFetch(accessToken, 'products', {
      method: 'POST',
      body: JSON.stringify({
        ...productValues,
        created_by: userId,
        updated_by: userId,
      }),
    });
    const createdProduct = Array.isArray(createdProducts)
      ? (createdProducts[0] as JsonRecord | undefined)
      : undefined;
    newProductId = scalarText(createdProduct?.id);
    if (!newProductId) throw new Error('Die neue Artikel-ID fehlt.');

    const variantIdMap = new Map<string, string>();
    for (const sourceVariant of variantRows) {
      const values = safeValues('product_variants', {
        ...withPrecision('product_variants', sourceVariant),
        productId: Number(newProductId),
        quantity: 0,
        discountPercent: 0,
        defectNote: null,
      });
      const created = await inventoryFetch(accessToken, 'product_variants', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const row = Array.isArray(created)
        ? (created[0] as JsonRecord | undefined)
        : undefined;
      const newVariantId = scalarText(row?.id);
      if (!newVariantId)
        throw new Error('Eine Variante konnte nicht kopiert werden.');
      variantIdMap.set(scalarText(sourceVariant.id), newVariantId);
      copiedVariantIds.push(newVariantId);
      await saveMeasurementPrecision(
        'product_variants',
        newVariantId,
        withPrecision('product_variants', sourceVariant),
      );
      const sourcePrices = copiedChannelPrices.get(
        `product_variants:${scalarText(sourceVariant.id)}`,
      );
      if (sourcePrices)
        await saveChannelPrices(
          'product_variants',
          newVariantId,
          sourcePrices,
          userId,
        );
    }

    for (const sourceFilament of filamentRows) {
      const sourceVariantId = scalarText(sourceFilament.productVariantId);
      const values = safeValues('product_filaments', {
        ...withPrecision('product_filaments', sourceFilament),
        productId: Number(newProductId),
        productVariantId: sourceVariantId
          ? Number(variantIdMap.get(sourceVariantId))
          : null,
        stockQuantity: 0,
      });
      const created = await inventoryFetch(accessToken, 'product_filaments', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const row = Array.isArray(created)
        ? (created[0] as JsonRecord | undefined)
        : undefined;
      const newFilamentId = scalarText(row?.id);
      if (!newFilamentId)
        throw new Error('Ein Druckteil konnte nicht kopiert werden.');
      await saveMeasurementPrecision(
        'product_filaments',
        newFilamentId,
        withPrecision('product_filaments', sourceFilament),
      );
    }

    for (const sourceComponent of Array.isArray(sourceComponents)
      ? (sourceComponents as JsonRecord[])
      : []) {
      const parentVariantId = scalarText(sourceComponent.parentVariantId);
      const values = safeValues('product_components', {
        ...sourceComponent,
        parentProductId: Number(newProductId),
        parentVariantId: parentVariantId
          ? Number(variantIdMap.get(parentVariantId))
          : null,
      });
      await inventoryFetch(accessToken, 'product_components', {
        method: 'POST',
        body: JSON.stringify({ ...values, created_by: userId }),
      });
    }

    for (const sourceAccessory of Array.isArray(sourceAccessories)
      ? (sourceAccessories as JsonRecord[])
      : []) {
      const productVariantId = scalarText(sourceAccessory.productVariantId);
      const values = safeValues('product_accessories', {
        ...sourceAccessory,
        productId: Number(newProductId),
        productVariantId: productVariantId
          ? Number(variantIdMap.get(productVariantId))
          : null,
      });
      await inventoryFetch(accessToken, 'product_accessories', {
        method: 'POST',
        body: JSON.stringify({ ...values, created_by: userId }),
      });
    }

    await saveProductMetadata(
      newProductId,
      { studioStatus: 'draft', finalizedAt: null, etsyListed: false },
      userId,
    );
    const sourceProductPrices = copiedChannelPrices.get(
      `products:${sourceProductId}`,
    );
    if (sourceProductPrices)
      await saveChannelPrices(
        'products',
        newProductId,
        sourceProductPrices,
        userId,
      );

    const assetResult = await env.DB.prepare(
      `SELECT id, asset_kind AS assetKind, object_key AS objectKey, filename,
              content_type AS contentType, size_bytes AS sizeBytes,
              is_primary AS isPrimary
       FROM inventory_product_assets WHERE product_id = ? ORDER BY created_at ASC`,
    )
      .bind(sourceProductId)
      .all<JsonRecord>();
    for (const sourceAsset of assetResult.results || []) {
      const stored = await env.FILES.get(scalarText(sourceAsset.objectKey));
      if (!stored) continue;
      const assetId = `ipa_${crypto.randomUUID()}`;
      const assetKind = scalarText(sourceAsset.assetKind, 'image');
      const filename = safeAssetFilename(
        scalarText(sourceAsset.filename, 'Datei'),
      );
      const objectKey = `inventory-products/${newProductId}/${assetKind}/${assetId}/${filename}`;
      await env.FILES.put(objectKey, stored.body, {
        httpMetadata: {
          contentType: scalarText(
            sourceAsset.contentType,
            'application/octet-stream',
          ),
        },
      });
      copiedAssetKeys.push(objectKey);
      const instant = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO inventory_product_assets
           (id, product_id, asset_kind, object_key, filename, content_type,
            size_bytes, is_primary, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          assetId,
          newProductId,
          assetKind,
          objectKey,
          filename,
          scalarText(sourceAsset.contentType, 'application/octet-stream'),
          Number(sourceAsset.sizeBytes) || 0,
          [1, true].includes(sourceAsset.isPrimary as boolean | number) ? 1 : 0,
          userId,
          instant,
          instant,
        )
        .run();
    }
    return newProductId;
  } catch (error) {
    for (const objectKey of copiedAssetKeys) await env.FILES.delete(objectKey);
    if (newProductId) {
      await env.DB.prepare(
        'DELETE FROM inventory_product_assets WHERE product_id = ?',
      )
        .bind(newProductId)
        .run();
      await env.DB.prepare(
        'DELETE FROM inventory_product_metadata WHERE product_id = ?',
      )
        .bind(newProductId)
        .run();
      await env.DB.prepare(
        `DELETE FROM inventory_channel_prices
         WHERE entity_kind = 'products' AND row_id = ?`,
      )
        .bind(newProductId)
        .run();
      if (copiedVariantIds.length)
        await env.DB.batch(
          copiedVariantIds.map((variantId) =>
            env.DB.prepare(
              `DELETE FROM inventory_channel_prices
               WHERE entity_kind = 'product_variants' AND row_id = ?`,
            ).bind(variantId),
          ),
        );
      await inventoryFetch(
        accessToken,
        `products?id=eq.${encodeURIComponent(newProductId)}`,
        { method: 'DELETE' },
      ).catch(() => null);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    action?: string;
    id?: string | number;
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
  if (body.entity === 'sales') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  try {
    if (body.action === 'duplicateProduct') {
      const sourceProductId = scalarText(body.id).trim();
      if (!sourceProductId)
        return Response.json({ error: 'Artikel-ID fehlt.' }, { status: 400 });
      const productId = await duplicateProduct(
        accessToken,
        sourceProductId,
        user.id || null,
      );
      return Response.json({ saved: true, productId }, { status: 201 });
    }
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
      const printDeadline = scalarText(body.order?.printDeadline).trim();
      const shippingDeadline = scalarText(body.order?.shippingDeadline).trim();
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
        (printDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(printDeadline)) ||
        (shippingDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(shippingDeadline))
      )
        return Response.json(
          { error: 'Planungs- und Versandtermin müssen gültige Daten sein.' },
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
            Math.round(Number(item.printMinutes) || 0),
          ),
          print_deadline: printDeadline || null,
          filament_material_id:
            Number(item.filamentMaterialId) > 0
              ? Number(item.filamentMaterialId)
              : null,
          filament_grams: Math.max(
            0,
            Math.round(Number(item.filamentGrams) || 0),
          ),
          filament_cost_cents: Math.max(
            0,
            Math.round(Number(item.filamentCostCents) || 0),
          ),
          electricity_cost_cents: Math.max(
            0,
            Math.round(Number(item.electricityCostCents) || 0),
          ),
          machine_cost_cents: Math.max(
            0,
            Math.round(Number(item.machineCostCents) || 0),
          ),
          accessory_cost_cents: Math.max(
            0,
            Math.round(Number(item.accessoryCostCents) || 0),
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
          shipping_deadline:
            channel === 'Abholung' ? null : shippingDeadline || null,
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
    const created = Array.isArray(result)
      ? (result[0] as JsonRecord | undefined)
      : undefined;
    if (['product_variants', 'product_filaments'].includes(body.entity)) {
      if (created?.id != null)
        await saveMeasurementPrecision(
          body.entity,
          scalarText(created.id),
          body.values,
        );
    }
    if (body.entity === 'product_variants' && created?.id != null)
      await saveVariantDefectMapping(scalarText(created.id), body.values);
    if (
      created?.id != null &&
      ['products', 'product_variants'].includes(body.entity)
    )
      await saveChannelPrices(
        body.entity,
        scalarText(created.id),
        body.values,
        user.id || null,
      );
    if (body.entity === 'products') {
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
  if (body.entity === 'sales') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  if (body.entity === 'shipping_details') {
    const sourceType = scalarText(body.values.sourceType).trim();
    const shippingMethod = scalarText(body.values.shippingMethod).trim();
    const trackingNumber = scalarText(body.values.trackingNumber).trim();
    if (!['online_sales', 'fulfillment_tasks'].includes(sourceType))
      return Response.json(
        { error: 'Verkaufsquelle ist ungültig.' },
        { status: 400 },
      );
    if (!supportedShippingMethods.has(shippingMethod) || shippingMethod === 'abholung')
      return Response.json(
        { error: 'Bitte einen gültigen Versanddienstleister auswählen.' },
        { status: 400 },
      );
    if (trackingNumber.length > 120)
      return Response.json(
        { error: 'Die Sendungsnummer ist zu lang.' },
        { status: 400 },
      );
    if (sourceType === 'online_sales') {
      await inventoryFetch(
        accessToken,
        `online_sales?id=eq.${encodeURIComponent(String(body.id))}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            shipping_method: shippingMethod,
            updated_by: user.id || null,
          }),
        },
      );
    }
    const instant = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO inventory_shipping_details
         (source_type, source_id, shipping_method, tracking_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_type, source_id) DO UPDATE SET
         shipping_method = excluded.shipping_method,
         tracking_number = excluded.tracking_number,
         updated_at = excluded.updated_at`,
    )
      .bind(
        sourceType,
        String(body.id),
        shippingMethod,
        trackingNumber || null,
        instant,
        instant,
      )
      .run();
    return Response.json({ saved: true });
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
  const submittedSaleItems =
    body.entity === 'sales' && Array.isArray(body.values.items)
      ? (body.values.items as JsonRecord[])
      : null;
  const values = safeValues(body.entity, body.values);
  const hasProductMetadata =
    body.entity === 'products' &&
    ['studioStatus', 'finalReviewed', 'finalizedAt', 'etsyListed'].some(
      (key) => key in body.values!,
    );
  const hasExpenseMetadata =
    body.entity === 'other_expenses' &&
    ['category', 'recurrence'].some((key) => key in body.values!);
  const hasChannelPrices =
    ['products', 'product_variants'].includes(body.entity) &&
    ['etsyPriceCents', 'vintedPriceCents', 'marketPriceCents'].some(
      (key) => key in body.values!,
    );
  const hasVariantDefectMetadata =
    body.entity === 'product_variants' &&
    'defectSourceVariantId' in body.values;
  if (
    (!values || !Object.keys(values).length) &&
    !submittedSaleItems?.length &&
    !hasProductMetadata &&
    !hasExpenseMetadata &&
    !hasChannelPrices &&
    !hasVariantDefectMetadata
  )
    return Response.json({ error: 'Keine gültigen Felder.' }, { status: 400 });
  try {
    if (body.entity === 'sales' && submittedSaleItems?.length) {
      const existing = await query(
        accessToken,
        'sale_items',
        `select=id,sale_id,article_variant_id,quantity&id=in.(${submittedSaleItems
          .map((item) => encodeURIComponent(scalarText(item.id)))
          .join(',')})`,
      );
      const existingRows = Array.isArray(existing)
        ? (existing as JsonRecord[])
        : [];
      if (
        existingRows.length !== submittedSaleItems.length ||
        existingRows.some(
          (item) => scalarText(item.saleId) !== scalarText(body.id),
        )
      )
        throw new Error('Mindestens eine Verkaufsposition ist ungültig.');
      const variantIds = existingRows
        .map((item) => item.articleVariantId)
        .filter((id) => id != null);
      const variants = variantIds.length
        ? ((await query(
            accessToken,
            'article_variants',
            `select=id,quantity_in_stock&id=in.(${variantIds
              .map((id) => encodeURIComponent(scalarText(id)))
              .join(',')})`,
          )) as JsonRecord[])
        : [];
      for (const submitted of submittedSaleItems) {
        const oldItem = existingRows.find(
          (item) => scalarText(item.id) === scalarText(submitted.id),
        );
        if (!oldItem) continue;
        const oldQuantity = Math.max(1, Math.trunc(Number(oldItem.quantity)));
        const newQuantity = Math.max(
          1,
          Math.trunc(Number(submitted.quantity) || 1),
        );
        const difference = oldQuantity - newQuantity;
        const variant = variants.find(
          (item) =>
            scalarText(item.id) === scalarText(oldItem.articleVariantId),
        );
        if (variant && difference) {
          const nextStock = Number(variant.quantityInStock) + difference;
          if (nextStock < 0)
            throw new Error(
              'Der Verkauf kann nicht erhöht werden: Der Marktbestand reicht nicht aus.',
            );
          await inventoryFetch(
            accessToken,
            `article_variants?id=eq.${encodeURIComponent(scalarText(variant.id))}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ quantity_in_stock: nextStock }),
            },
          );
          variant.quantityInStock = nextStock;
        }
        const itemValues = safeValues('sale_items', submitted) || {};
        await inventoryFetch(
          accessToken,
          `sale_items?id=eq.${encodeURIComponent(scalarText(submitted.id))}`,
          { method: 'PATCH', body: JSON.stringify(itemValues) },
        );
        await env.DB.prepare(
          `UPDATE inventory_fulfillment_tasks
           SET quantity = ?, sale_date = COALESCE(?, sale_date), updated_at = ?
           WHERE sale_id = ? AND article_variant_id = ?`,
        )
          .bind(
            newQuantity,
            scalarText(body.values.date) || null,
            new Date().toISOString(),
            scalarText(body.id),
            scalarText(oldItem.articleVariantId),
          )
          .run();
      }
    }
    let previousOnlineSale: JsonRecord | null = null;
    if (
      body.entity === 'online_sales' &&
      ('isShipped' in body.values || 'quantity' in body.values)
    ) {
      const previous = await query(
        accessToken,
        'online_sales',
        `select=id,is_shipped,product_id,quantity&id=eq.${encodeURIComponent(String(body.id))}&limit=1`,
      );
      previousOnlineSale = Array.isArray(previous)
        ? ((previous[0] as JsonRecord | undefined) ?? null)
        : null;
      if (
        previousOnlineSale?.isShipped === true &&
        'quantity' in body.values &&
        Math.max(1, Math.trunc(Number(body.values.quantity) || 1)) !==
          Math.max(1, Math.trunc(Number(previousOnlineSale.quantity) || 1))
      )
        throw new Error(
          'Die Menge eines bereits versendeten Verkaufs kann erst geändert werden, nachdem der Versandstatus zurückgenommen wurde.',
        );
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
    await saveMeasurementPrecision(body.entity, String(body.id), body.values);
    if (hasVariantDefectMetadata)
      await saveVariantDefectMapping(String(body.id), body.values);
    if (hasChannelPrices)
      await saveChannelPrices(
        body.entity,
        String(body.id),
        body.values,
        user.id || null,
      );
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
    if (body.entity === 'sales' || body.entity === 'online_sales')
      await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
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
  if (
    !body.entity ||
    body.id == null ||
    (!trashableEntities.has(body.entity) &&
      !removableRelationEntities.has(body.entity))
  )
    return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
  if (body.entity === 'other_expenses') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  if (body.entity === 'sales' || body.entity === 'online_sales') {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  try {
    if (body.entity === 'sales') {
      if (body.restore)
        return Response.json(
          {
            error:
              'Gelöschte Verkäufe werden nicht automatisch wiederhergestellt.',
          },
          { status: 400 },
        );
      const found = await query(
        accessToken,
        'sales',
        `select=id,is_cancelled,items:sale_items(id,article_variant_id,quantity)&id=eq.${encodeURIComponent(String(body.id))}&limit=1`,
      );
      const sale = Array.isArray(found)
        ? ((found[0] as JsonRecord | undefined) ?? null)
        : null;
      if (!sale) throw new Error('Verkauf wurde nicht gefunden.');
      if (sale.isCancelled !== true) {
        for (const item of Array.isArray(sale.items)
          ? (sale.items as JsonRecord[])
          : []) {
          const variants = await query(
            accessToken,
            'article_variants',
            `select=id,quantity_in_stock&id=eq.${encodeURIComponent(scalarText(item.articleVariantId))}&limit=1`,
          );
          const variant = Array.isArray(variants)
            ? (variants[0] as JsonRecord | undefined)
            : undefined;
          if (variant)
            await inventoryFetch(
              accessToken,
              `article_variants?id=eq.${encodeURIComponent(scalarText(variant.id))}`,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  quantity_in_stock:
                    Number(variant.quantityInStock) +
                    Math.max(1, Math.trunc(Number(item.quantity) || 1)),
                }),
              },
            );
        }
      }
      const result = await inventoryFetch(
        accessToken,
        `sales?id=eq.${encodeURIComponent(String(body.id))}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_cancelled: true,
            deleted_at: new Date().toISOString(),
          }),
        },
      );
      await env.DB.prepare(
        `DELETE FROM inventory_fulfillment_tasks WHERE sale_id = ?`,
      )
        .bind(String(body.id))
        .run();
      await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
      return Response.json({ deleted: true, result });
    }
    if (body.entity === 'online_sales') {
      if (body.restore)
        return Response.json(
          {
            error:
              'Gelöschte Verkäufe werden nicht automatisch wiederhergestellt.',
          },
          { status: 400 },
        );
      const found = await query(
        accessToken,
        'online_sales',
        `select=id,is_shipped,product_id&id=eq.${encodeURIComponent(String(body.id))}&limit=1`,
      );
      const sale = Array.isArray(found)
        ? ((found[0] as JsonRecord | undefined) ?? null)
        : null;
      if (!sale) throw new Error('Verkauf wurde nicht gefunden.');
      if (sale.isShipped === true && sale.productId != null) {
        const products = await query(
          accessToken,
          'products',
          `select=category&id=eq.${encodeURIComponent(scalarText(sale.productId))}&limit=1`,
        );
        const category = Array.isArray(products)
          ? scalarText((products[0] as JsonRecord | undefined)?.category)
          : '';
        if (!/stl|digital/i.test(category))
          await inventoryFetch(accessToken, 'rpc/versand_zuruecknehmen', {
            method: 'POST',
            body: JSON.stringify({
              p_operation_id: crypto.randomUUID(),
              p_sale_id: Number(body.id),
            }),
          });
      }
      const result = await inventoryFetch(
        accessToken,
        `online_sales?id=eq.${encodeURIComponent(String(body.id))}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            deleted_at: new Date().toISOString(),
            updated_by: user.id || null,
          }),
        },
      );
      await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
      return Response.json({ deleted: true, result });
    }
    if (removableRelationEntities.has(body.entity)) {
      const rowId = encodeURIComponent(String(body.id));
      let result: unknown;
      try {
        result = await inventoryFetch(
          accessToken,
          `${body.entity}?id=eq.${rowId}`,
          { method: 'DELETE' },
        );
      } catch (error) {
        if (body.entity !== 'product_variants') throw error;
        await inventoryFetch(
          accessToken,
          `stock_movements?product_variant_id=eq.${rowId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ product_variant_id: null }),
          },
        );
        await inventoryFetch(
          accessToken,
          `product_filaments?product_variant_id=eq.${rowId}`,
          { method: 'DELETE' },
        );
        await inventoryFetch(
          accessToken,
          `product_components?or=(parent_variant_id.eq.${rowId},component_variant_id.eq.${rowId})`,
          { method: 'DELETE' },
        );
        await inventoryFetch(
          accessToken,
          `product_accessories?or=(product_variant_id.eq.${rowId},accessory_variant_id.eq.${rowId})`,
          { method: 'DELETE' },
        );
        await inventoryFetch(
          accessToken,
          `market_demands?product_variant_id=eq.${rowId}`,
          { method: 'DELETE' },
        );
        result = await inventoryFetch(
          accessToken,
          `product_variants?id=eq.${rowId}`,
          { method: 'DELETE' },
        );
      }
      if (body.entity === 'product_variants') {
        await env.DB.batch([
          env.DB.prepare(
            `DELETE FROM inventory_channel_prices
             WHERE entity_kind = 'product_variants' AND row_id = ?`,
          ).bind(String(body.id)),
          env.DB.prepare(
            `DELETE FROM inventory_measurement_precision
             WHERE entity_kind = 'product_variants' AND row_id = ?`,
          ).bind(String(body.id)),
          env.DB.prepare(
            `DELETE FROM inventory_variant_defects WHERE variant_id = ?`,
          ).bind(String(body.id)),
          env.DB.prepare(
            `UPDATE inventory_variant_defects
             SET source_variant_id = NULL, updated_at = ?
             WHERE source_variant_id = ?`,
          ).bind(new Date().toISOString(), String(body.id)),
        ]);
      }
      return Response.json({ deleted: true, result });
    }
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
