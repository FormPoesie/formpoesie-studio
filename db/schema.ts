import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const brandProfiles = sqliteTable('brand_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  voice: text('voice').notNull(),
  paletteJson: text('palette_json').notNull(),
  rulesJson: text('rules_json').notNull(),
  ...timestamps,
});

export const materialProfiles = sqliteTable('material_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pricePerKg: real('price_per_kg'),
  propertiesJson: text('properties_json').notNull().default('{}'),
  ...timestamps,
});

export const costProfiles = sqliteTable('cost_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  machinePerHour: real('machine_per_hour'),
  electricityPerHour: real('electricity_per_hour'),
  electricityIncluded: integer('electricity_included', { mode: 'boolean' }).notNull().default(false),
  laborPerHour: real('labor_per_hour'),
  overheadPerOrder: real('overhead_per_order'),
  targetMargin: real('target_margin'),
  ...timestamps,
});

export const feeProfiles = sqliteTable('fee_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  feesJson: text('fees_json').notNull(),
  validFrom: text('valid_from'),
  sourceUrl: text('source_url'),
  ...timestamps,
});

export const shippingProfiles = sqliteTable('shipping_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country'),
  postage: real('postage'),
  buyerShipping: real('buyer_shipping'),
  processingDays: text('processing_days'),
  packagingCost: real('packaging_cost'),
  ...timestamps,
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  modelName: text('model_name').notNull(),
  productType: text('product_type').notNull(),
  sku: text('sku'),
  buyerWorld: text('buyer_world').notNull(),
  description: text('description'),
  material: text('material'),
  materialStatus: text('material_status').notNull().default('open'),
  widthMm: real('width_mm'),
  heightMm: real('height_mm'),
  depthMm: real('depth_mm'),
  dimensionsStatus: text('dimensions_status').notNull().default('open'),
  designOrigin: text('design_origin'),
  etsyEligibility: text('etsy_eligibility').notNull().default('open'),
  status: text('status').notNull().default('draft'),
  factsJson: text('facts_json').notNull().default('{}'),
  ...timestamps,
}, (table) => [index('idx_products_status').on(table.status), uniqueIndex('idx_products_sku').on(table.sku)]);

export const variants = sqliteTable('variants', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sku: text('sku'),
  color: text('color'),
  material: text('material'),
  setSize: integer('set_size').notNull().default(1),
  weightGrams: real('weight_grams'),
  printHours: real('print_hours'),
  activeMinutes: real('active_minutes'),
  failureRate: real('failure_rate').notNull().default(0.08),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
}, (table) => [index('idx_variants_product').on(table.productId)]);

export const originalAssets = sqliteTable('original_assets', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').references(() => variants.id, { onDelete: 'set null' }),
  objectKey: text('object_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  view: text('view').notNull().default('unknown'),
  qualityStatus: text('quality_status').notNull().default('pending'),
  ...timestamps,
}, (table) => [index('idx_original_assets_product').on(table.productId)]);

export const imagePlans = sqliteTable('image_plans', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  rolesJson: text('roles_json').notNull(),
  lockedRolesJson: text('locked_roles_json').notNull().default('[]'),
  stale: integer('stale', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const generatedAssets = sqliteTable('generated_assets', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  originalAssetId: text('original_asset_id').references(() => originalAssets.id),
  objectKey: text('object_key'),
  role: text('role').notNull(),
  title: text('title').notNull(),
  filename: text('filename').notNull(),
  altText: text('alt_text').notNull(),
  locale: text('locale').notNull().default('de'),
  exportFormat: text('export_format').notNull().default('image/jpeg'),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const researchRuns = sqliteTable('research_runs', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  market: text('market').notNull(),
  source: text('source').notNull(),
  period: text('period'),
  fetchedAt: text('fetched_at').notNull(),
  status: text('status').notNull(),
  ...timestamps,
});

export const keywordCandidates = sqliteTable('keyword_candidates', {
  id: text('id').primaryKey(),
  researchRunId: text('research_run_id').notNull().references(() => researchRuns.id, { onDelete: 'cascade' }),
  phrase: text('phrase').notNull(),
  demand: real('demand'),
  competition: real('competition'),
  relevance: integer('relevance').notNull(),
  intent: integer('intent').notNull(),
  selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
  evidenceUrl: text('evidence_url'),
});

export const listingDrafts = sqliteTable('listing_drafts', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  state: text('state').notNull().default('local'),
  mode: text('mode').notNull().default('autopilot'),
  category: text('category'),
  taxonomyId: integer('taxonomy_id'),
  lockedJson: text('locked_json').notNull().default('[]'),
  remoteId: text('remote_id'),
  transferKey: text('transfer_key'),
  transferStatus: text('transfer_status').notNull().default('not_connected'),
  ...timestamps,
});

export const localeContents = sqliteTable('locale_contents', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => listingDrafts.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  titlesJson: text('titles_json').notNull(),
  selectedTitle: integer('selected_title').notNull().default(0),
  description: text('description').notNull(),
  tagsJson: text('tags_json').notNull(),
  lockedJson: text('locked_json').notNull().default('[]'),
  ...timestamps,
}, (table) => [uniqueIndex('idx_locale_contents_draft_locale').on(table.draftId, table.locale)]);

export const pricingScenarios = sqliteTable('pricing_scenarios', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').references(() => variants.id, { onDelete: 'cascade' }),
  directPrice: real('direct_price').notNull(),
  etsyPrice: real('etsy_price').notNull(),
  floorPrice: real('floor_price').notNull(),
  resultWithoutAds: real('result_without_ads').notNull(),
  resultWithAds: real('result_with_ads').notNull(),
  confidence: text('confidence').notNull(),
  assumptionsJson: text('assumptions_json').notNull(),
  breakdownJson: text('breakdown_json').notNull(),
  ...timestamps,
});

export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  attempt: integer('attempt').notNull().default(0),
  costEstimate: real('cost_estimate'),
  lastError: text('last_error'),
  ...timestamps,
});

export const integrationConnections = sqliteTable('integration_connections', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  shopId: text('shop_id'),
  status: text('status').notNull().default('not_connected'),
  scopesJson: text('scopes_json').notNull().default('[]'),
  ...timestamps,
});

export const exportRecords = sqliteTable('export_records', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  format: text('format').notNull(),
  objectKey: text('object_key'),
  manifestJson: text('manifest_json').notNull(),
  ...timestamps,
});

export const changeHistory = sqliteTable('change_history', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_change_history_entity').on(table.entityType, table.entityId)]);
