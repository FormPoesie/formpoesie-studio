import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

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
  electricityIncluded: integer('electricity_included', { mode: 'boolean' })
    .notNull()
    .default(false),
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

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    modelName: text('model_name').notNull(),
    productType: text('product_type').notNull(),
    sku: text('sku'),
    buyerWorld: text('buyer_world').notNull(),
    description: text('description'),
    material: text('material'),
    sizeLabel: text('size_label'),
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
  },
  (table) => [
    index('idx_products_status').on(table.status),
    uniqueIndex('idx_products_sku').on(table.sku),
  ],
);

export const inventoryProductMetadata = sqliteTable(
  'inventory_product_metadata',
  {
    productId: text('product_id').primaryKey(),
    reviewStatus: text('review_status').notNull().default('draft'),
    finalizedAt: text('finalized_at'),
    etsyListed: integer('etsy_listed', { mode: 'boolean' })
      .notNull()
      .default(false),
    updatedBy: text('updated_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_inventory_product_metadata_status').on(table.reviewStatus),
  ],
);

export const inventoryChannelPrices = sqliteTable(
  'inventory_channel_prices',
  {
    entityKind: text('entity_kind').notNull(),
    rowId: text('row_id').notNull(),
    etsyPriceCents: integer('etsy_price_cents'),
    vintedPriceCents: integer('vinted_price_cents'),
    marketPriceCents: integer('market_price_cents'),
    updatedBy: text('updated_by'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_inventory_channel_prices_entity_row').on(
      table.entityKind,
      table.rowId,
    ),
  ],
);

export const inventoryProductAssets = sqliteTable(
  'inventory_product_assets',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),
    assetKind: text('asset_kind').notNull(),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_inventory_product_assets_product').on(
      table.productId,
      table.assetKind,
    ),
    index('idx_inventory_product_assets_primary').on(
      table.productId,
      table.isPrimary,
    ),
  ],
);

export const inventoryExpenseMetadata = sqliteTable(
  'inventory_expense_metadata',
  {
    expenseId: text('expense_id').primaryKey(),
    category: text('category'),
    recurrence: text('recurrence').notNull().default('none'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [index('idx_inventory_expense_recurrence').on(table.recurrence)],
);

export const businessDocuments = sqliteTable(
  'business_documents',
  {
    id: text('id').primaryKey(),
    relationType: text('relation_type').notNull(),
    relationId: text('relation_id'),
    documentKind: text('document_kind').notNull(),
    title: text('title'),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_business_documents_relation').on(
      table.relationType,
      table.relationId,
    ),
  ],
);

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email'),
    address: text('address').notNull(),
    note: text('note'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_customers_name').on(table.name),
    index('idx_customers_email').on(table.email),
  ],
);

export const invoiceCounters = sqliteTable('invoice_counters', {
  year: integer('year').primaryKey(),
  lastNumber: integer('last_number').notNull().default(0),
});

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull(),
    customerId: text('customer_id'),
    orderKey: text('order_key'),
    sourceSaleIdsJson: text('source_sale_ids_json').notNull().default('[]'),
    status: text('status').notNull().default('draft'),
    issueDate: text('issue_date').notNull(),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email'),
    customerAddress: text('customer_address'),
    channel: text('channel').notNull(),
    currency: text('currency').notNull().default('EUR'),
    itemsJson: text('items_json').notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    businessSnapshotJson: text('business_snapshot_json')
      .notNull()
      .default('{}'),
    note: text('note'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_invoices_number').on(table.invoiceNumber),
    index('idx_invoices_issue_date').on(table.issueDate),
    index('idx_invoices_order_key').on(table.orderKey),
  ],
);

export const variants = sqliteTable(
  'variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sku: text('sku'),
    color: text('color'),
    material: text('material'),
    setSize: integer('set_size').notNull().default(1),
    weightGrams: real('weight_grams'),
    printHours: real('print_hours'),
    activeMinutes: real('active_minutes'),
    failureRate: real('failure_rate').notNull().default(0.08),
    confirmed: integer('confirmed', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [index('idx_variants_product').on(table.productId)],
);

export const originalAssets = sqliteTable(
  'original_assets',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: text('variant_id').references(() => variants.id, {
      onDelete: 'set null',
    }),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    view: text('view').notNull().default('unknown'),
    qualityStatus: text('quality_status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('idx_original_assets_product').on(table.productId)],
);

export const imagePlans = sqliteTable('image_plans', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  rolesJson: text('roles_json').notNull(),
  lockedRolesJson: text('locked_roles_json').notNull().default('[]'),
  stale: integer('stale', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const generatedAssets = sqliteTable('generated_assets', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  originalAssetId: text('original_asset_id').references(
    () => originalAssets.id,
  ),
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
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
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
  researchRunId: text('research_run_id')
    .notNull()
    .references(() => researchRuns.id, { onDelete: 'cascade' }),
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
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
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

export const localeContents = sqliteTable(
  'locale_contents',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .references(() => listingDrafts.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    titlesJson: text('titles_json').notNull(),
    selectedTitle: integer('selected_title').notNull().default(0),
    description: text('description').notNull(),
    tagsJson: text('tags_json').notNull(),
    lockedJson: text('locked_json').notNull().default('[]'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_locale_contents_draft_locale').on(
      table.draftId,
      table.locale,
    ),
  ],
);

export const pricingScenarios = sqliteTable('pricing_scenarios', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').references(() => variants.id, {
    onDelete: 'cascade',
  }),
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

export const pricingAssets = sqliteTable(
  'pricing_assets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category'),
    era: text('era'),
    topicCluster: text('topic_cluster'),
    awareness: text('awareness'),
    demand: text('demand'),
    competition: text('competition'),
    ...timestamps,
  },
  (table) => [
    index('idx_pricing_assets_name').on(table.name),
    index('idx_pricing_assets_topic').on(table.topicCluster),
  ],
);

export const pricingProductProfiles = sqliteTable(
  'pricing_product_profiles',
  {
    inventoryProductId: text('inventory_product_id').primaryKey(),
    assetId: text('asset_id').references(() => pricingAssets.id, {
      onDelete: 'set null',
    }),
    productKind: text('product_kind').notNull().default('physical'),
    marketCategory: text('market_category'),
    tier: text('tier').notNull().default('standard'),
    shapeType: text('shape_type'),
    season: text('season'),
    demand: text('demand'),
    competition: text('competition'),
    lengthCm: real('length_cm'),
    widthCm: real('width_cm'),
    heightCm: real('height_cm'),
    valueJson: text('value_json').notNull().default('{}'),
    licenseJson: text('license_json').notNull().default('{}'),
    updatedBy: text('updated_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_pricing_profiles_asset').on(table.assetId),
    index('idx_pricing_profiles_category').on(table.marketCategory),
  ],
);

export const pricingRecommendations = sqliteTable(
  'pricing_recommendations',
  {
    id: text('id').primaryKey(),
    inventoryProductId: text('inventory_product_id').notNull(),
    inventoryVariantId: text('inventory_variant_id'),
    channel: text('channel').notNull(),
    recommendationKind: text('recommendation_kind')
      .notNull()
      .default('physical'),
    configVersion: text('config_version').notNull(),
    cogsCents: integer('cogs_cents'),
    activePriceSnapshotCents: integer('active_price_snapshot_cents'),
    recommendedPriceCents: integer('recommended_price_cents'),
    inputJson: text('input_json').notNull(),
    resultJson: text('result_json').notNull(),
    status: text('status').notNull().default('CURRENT'),
    marketChangeId: text('market_change_id'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_pricing_recommendations_product').on(
      table.inventoryProductId,
      table.inventoryVariantId,
      table.createdAt,
    ),
    index('idx_pricing_recommendations_channel').on(
      table.channel,
      table.createdAt,
    ),
    index('idx_pricing_recommendations_status').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const bWareEvaluations = sqliteTable(
  'b_ware_evaluations',
  {
    id: text('id').primaryKey(),
    inventoryProductId: text('inventory_product_id').notNull(),
    inventoryVariantId: text('inventory_variant_id'),
    channel: text('channel').notNull(),
    affectedArea: text('affected_area'),
    inputJson: text('input_json').notNull(),
    resultJson: text('result_json').notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_b_ware_product').on(
      table.inventoryProductId,
      table.inventoryVariantId,
      table.createdAt,
    ),
  ],
);

export const marketPricingOutcomes = sqliteTable(
  'market_pricing_outcomes',
  {
    id: text('id').primaryKey(),
    marketId: text('market_id').notNull(),
    expectedSales: integer('expected_sales').notNull(),
    actualSales: integer('actual_sales'),
    actualRevenueCents: integer('actual_revenue_cents'),
    standFeeCents: integer('stand_fee_cents').notNull().default(0),
    travelCostCents: integer('travel_cost_cents').notNull().default(0),
    additionalCostCents: integer('additional_cost_cents').notNull().default(0),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [index('idx_market_pricing_outcomes_market').on(table.marketId)],
);

export const pricingConfigValues = sqliteTable('pricing_config_values', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at').notNull(),
});

export const marketClusters = sqliteTable(
  'market_clusters',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    level: integer('level').notNull(),
    dimension: text('dimension').notNull(),
    label: text('label').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    searchTermsJson: text('search_terms_json').notNull().default('[]'),
    status: text('status').notNull().default('NEW'),
    researchPriority: real('research_priority').notNull().default(0.5),
    researchFrequency: text('research_frequency').notNull().default('NEW'),
    lastResearchedAt: text('last_researched_at'),
    lastValidSnapshotId: text('last_valid_snapshot_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_market_clusters_key').on(table.normalizedKey),
    index('idx_market_clusters_priority').on(
      table.researchFrequency,
      table.researchPriority,
    ),
  ],
);

export const marketClusterProducts = sqliteTable(
  'market_cluster_products',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => marketClusters.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    variantId: text('variant_id'),
    relevance: real('relevance').notNull().default(1),
    reasonsJson: text('reasons_json').notNull().default('[]'),
    catalogUpdatedAt: text('catalog_updated_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_market_cluster_products_unique').on(
      table.clusterId,
      table.productId,
      table.variantId,
    ),
    index('idx_market_cluster_products_product').on(table.productId),
  ],
);

export const marketResearchQueries = sqliteTable(
  'market_research_queries',
  {
    id: text('id').primaryKey(),
    clusterId: text('cluster_id')
      .notNull()
      .references(() => marketClusters.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    language: text('language').notNull(),
    intent: text('intent').notNull().default('buy'),
    status: text('status').notNull().default('ACTIVE'),
    yieldScore: real('yield_score'),
    lastUsedAt: text('last_used_at'),
    discoveredFrom: text('discovered_from'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_market_queries_cluster_query').on(
      table.clusterId,
      table.query,
    ),
    index('idx_market_queries_status').on(table.clusterId, table.status),
  ],
);

export const marketResearchRuns = sqliteTable(
  'market_research_runs',
  {
    id: text('id').primaryKey(),
    runKind: text('run_kind').notNull(),
    status: text('status').notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    catalogFingerprint: text('catalog_fingerprint'),
    clusterCount: integer('cluster_count').notNull().default(0),
    queryCount: integer('query_count').notNull().default(0),
    foundCount: integer('found_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    comparableCount: integer('comparable_count').notNull().default(0),
    snapshotCount: integer('snapshot_count').notNull().default(0),
    changeCount: integer('change_count').notNull().default(0),
    pricingImpactCount: integer('pricing_impact_count').notNull().default(0),
    errorJson: text('error_json').notNull().default('[]'),
    auditJson: text('audit_json').notNull().default('{}'),
  },
  (table) => [index('idx_market_runs_started').on(table.startedAt)],
);

export const marketObservations = sqliteTable(
  'market_observations',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => marketResearchRuns.id, { onDelete: 'cascade' }),
    clusterId: text('cluster_id')
      .notNull()
      .references(() => marketClusters.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    sourceUrl: text('source_url').notNull(),
    platform: text('platform'),
    listingKey: text('listing_key').notNull(),
    researchedAt: text('researched_at').notNull(),
    title: text('title').notNull(),
    seller: text('seller'),
    physicalOrDigital: text('physical_or_digital').notNull(),
    currency: text('currency'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    shippingPriceCents: integer('shipping_price_cents'),
    visibleCustomerPriceCents: integer('visible_customer_price_cents'),
    productType: text('product_type'),
    functionLabel: text('function_label'),
    style: text('style'),
    motif: text('motif'),
    person: text('person'),
    dimensionsJson: text('dimensions_json').notNull().default('{}'),
    variantsJson: text('variants_json').notNull().default('[]'),
    material: text('material'),
    finish: text('finish'),
    personalization: integer('personalization', { mode: 'boolean' }),
    bundleSize: integer('bundle_size'),
    reviewCount: integer('review_count'),
    rating: real('rating'),
    popularityJson: text('popularity_json').notNull().default('{}'),
    comparabilityScore: real('comparability_score').notNull(),
    sourceQualityScore: real('source_quality_score').notNull(),
    rawMetadataJson: text('raw_metadata_json').notNull().default('{}'),
  },
  (table) => [
    uniqueIndex('idx_market_observations_run_listing').on(
      table.runId,
      table.clusterId,
      table.listingKey,
    ),
    index('idx_market_observations_cluster').on(
      table.clusterId,
      table.researchedAt,
    ),
    index('idx_market_observations_seller').on(table.clusterId, table.seller),
  ],
);

export const marketSnapshots = sqliteTable(
  'market_snapshots',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => marketResearchRuns.id, { onDelete: 'cascade' }),
    clusterId: text('cluster_id')
      .notNull()
      .references(() => marketClusters.id, { onDelete: 'cascade' }),
    timestamp: text('timestamp').notNull(),
    status: text('status').notNull().default('VALID'),
    demandScore: real('demand_score'),
    externalDemandScore: real('external_demand_score'),
    internalSalesScore: real('internal_sales_score'),
    internalSalesTrend: real('internal_sales_trend'),
    competitionScore: real('competition_score'),
    observedTrend: real('observed_trend'),
    seasonalitySignal: real('seasonality_signal'),
    adjustedTrend: real('adjusted_trend'),
    trendState: text('trend_state').notNull().default('BASELINE'),
    p25Cents: integer('p25_cents'),
    medianCents: integer('median_cents'),
    p75Cents: integer('p75_cents'),
    p90Cents: integer('p90_cents'),
    sampleSize: integer('sample_size').notNull().default(0),
    effectiveSampleSize: real('effective_sample_size').notNull().default(0),
    averageComparability: real('average_comparability'),
    sourceDiversity: integer('source_diversity').notNull().default(0),
    sellerDiversity: integer('seller_diversity').notNull().default(0),
    confidence: text('confidence').notNull(),
    sourceDistributionJson: text('source_distribution_json')
      .notNull()
      .default('{}'),
    diagnosticsJson: text('diagnostics_json').notNull().default('{}'),
  },
  (table) => [
    index('idx_market_snapshots_cluster').on(table.clusterId, table.timestamp),
  ],
);

export const marketChanges = sqliteTable(
  'market_changes',
  {
    id: text('id').primaryKey(),
    clusterId: text('cluster_id').notNull(),
    previousSnapshotId: text('previous_snapshot_id'),
    currentSnapshotId: text('current_snapshot_id').notNull(),
    changeType: text('change_type').notNull(),
    confidence: text('confidence').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json').notNull(),
    affectedProductIdsJson: text('affected_product_ids_json')
      .notNull()
      .default('[]'),
    affectedVariantIdsJson: text('affected_variant_ids_json')
      .notNull()
      .default('[]'),
    sourcesJson: text('sources_json').notNull().default('[]'),
    explanationJson: text('explanation_json').notNull().default('[]'),
    detectedAt: text('detected_at').notNull(),
  },
  (table) => [
    index('idx_market_changes_cluster').on(table.clusterId, table.detectedAt),
    index('idx_market_changes_type').on(table.changeType, table.detectedAt),
  ],
);

export const pricingImpacts = sqliteTable(
  'pricing_impacts',
  {
    id: text('id').primaryKey(),
    marketChangeId: text('market_change_id')
      .notNull()
      .references(() => marketChanges.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    variantId: text('variant_id'),
    channel: text('channel').notNull(),
    previousRecommendationCents: integer('previous_recommendation_cents'),
    newRecommendationCents: integer('new_recommendation_cents'),
    absoluteDifferenceCents: integer('absolute_difference_cents'),
    percentageDifference: real('percentage_difference'),
    status: text('status').notNull().default('STALE_MARKET_DATA'),
    recommendationId: text('recommendation_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_pricing_impacts_change_variant_channel').on(
      table.marketChangeId,
      table.productId,
      table.variantId,
      table.channel,
    ),
    index('idx_pricing_impacts_product').on(table.productId, table.createdAt),
  ],
);

export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id, {
    onDelete: 'cascade',
  }),
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
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  format: text('format').notNull(),
  objectKey: text('object_key'),
  manifestJson: text('manifest_json').notNull(),
  ...timestamps,
});

export const changeHistory = sqliteTable(
  'change_history',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_change_history_entity').on(table.entityType, table.entityId),
  ],
);

export const accountSecrets = sqliteTable('account_secrets', {
  accountId: text('account_id').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  salt: text('salt').notNull(),
  iterations: integer('iterations').notNull().default(310000),
  ...timestamps,
});

export const mindMapNodes = sqliteTable(
  'mind_map_nodes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('waiting_review'),
    color: text('color').notNull().default('#4a5c58'),
    textColor: text('text_color').notNull().default('#ffffff'),
    positionX: real('position_x').notNull(),
    positionY: real('position_y').notNull(),
    width: real('width').notNull().default(240),
    height: real('height').notNull().default(150),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    ...timestamps,
  },
  (table) => [index('idx_mind_map_nodes_updated_at').on(table.updatedAt)],
);

export const mindMapEdges = sqliteTable(
  'mind_map_edges',
  {
    id: text('id').primaryKey(),
    sourceNodeId: text('source_node_id')
      .notNull()
      .references(() => mindMapNodes.id, { onDelete: 'cascade' }),
    targetNodeId: text('target_node_id')
      .notNull()
      .references(() => mindMapNodes.id, { onDelete: 'cascade' }),
    color: text('color'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_mind_map_edges_nodes').on(
      table.sourceNodeId,
      table.targetNodeId,
    ),
    index('idx_mind_map_edges_target').on(table.targetNodeId),
  ],
);

export const mindMapComments = sqliteTable(
  'mind_map_comments',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => mindMapNodes.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    authorId: text('author_id'),
    authorName: text('author_name').notNull(),
    ...timestamps,
  },
  (table) => [
    index('idx_mind_map_comments_node').on(table.nodeId, table.createdAt),
  ],
);

export const newsCalendarEntries = sqliteTable(
  'news_calendar_entries',
  {
    id: text('id').primaryKey(),
    topic: text('topic').notNull(),
    category: text('category').notNull(),
    organization: text('organization'),
    location: text('location'),
    eventDate: text('event_date').notNull(),
    publishedDate: text('published_date'),
    capturedAt: text('captured_at'),
    sourceName: text('source_name'),
    sourceUrl: text('source_url'),
    summary: text('summary'),
    whatsNew: text('whats_new'),
    relevance: text('relevance'),
    confidence: text('confidence'),
    payloadJson: text('payload_json').notNull(),
    ...timestamps,
  },
  (table) => [index('idx_news_calendar_event_date').on(table.eventDate)],
);

export const newsCalendarMeta = sqliteTable('news_calendar_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const monitorSnapshots = sqliteTable('monitor_snapshots', {
  accountId: text('account_id').primaryKey(),
  profileUrl: text('profile_url').notNull(),
  fingerprint: text('fingerprint').notNull(),
  headline: text('headline'),
  checkedAt: text('checked_at').notNull(),
  changedAt: text('changed_at'),
});

export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    sourceUrl: text('source_url'),
    occurredAt: text('occurred_at').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'),
  },
  (table) => [index('idx_activity_events_occurred_at').on(table.occurredAt)],
);

export const inventoryVenueClassifications = sqliteTable(
  'inventory_venue_classifications',
  {
    marketId: text('market_id').primaryKey(),
    kind: text('kind').notNull().default('market'),
    ...timestamps,
  },
  (table) => [index('idx_inventory_venue_kind').on(table.kind)],
);

export const inventoryFulfillmentTasks = sqliteTable(
  'inventory_fulfillment_tasks',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    saleId: text('sale_id').notNull(),
    articleVariantId: text('article_variant_id'),
    articleName: text('article_name').notNull(),
    variantName: text('variant_name'),
    venueName: text('venue_name'),
    quantity: integer('quantity').notNull().default(1),
    fulfillmentMode: text('fulfillment_mode').notNull().default('pickup'),
    isPrinted: integer('is_printed', { mode: 'boolean' })
      .notNull()
      .default(false),
    isShipped: integer('is_shipped', { mode: 'boolean' })
      .notNull()
      .default(false),
    saleDate: text('sale_date').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_inventory_fulfillment_source').on(
      table.sourceType,
      table.sourceId,
    ),
    index('idx_inventory_fulfillment_open').on(
      table.isPrinted,
      table.isShipped,
    ),
  ],
);

export const monthlyProductHighlights = sqliteTable(
  'monthly_product_highlights',
  {
    month: text('month').primaryKey(),
    productKey: text('product_key').notNull(),
    productName: text('product_name').notNull(),
    productQuantity: integer('product_quantity').notNull(),
    totalQuantity: integer('total_quantity').notNull(),
    calculatedAt: text('calculated_at').notNull(),
    ...timestamps,
  },
  (table) => [index('idx_monthly_product_month').on(table.month)],
);

export const etsyWorkflows = sqliteTable(
  'etsy_workflows',
  {
    id: text('id').primaryKey(),
    inventoryProductId: text('inventory_product_id').notNull(),
    productSnapshotJson: text('product_snapshot_json').notNull(),
    currentState: text('current_state').notNull().default('IMAGE_UPLOAD'),
    status: text('status').notNull().default('IN_PROGRESS'),
    revision: integer('revision').notNull().default(1),
    completedAt: text('completed_at'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => [
    index('idx_etsy_workflows_product').on(
      table.inventoryProductId,
      table.completedAt,
    ),
  ],
);

export const etsyWorkflowSteps = sqliteTable(
  'etsy_workflow_steps',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => etsyWorkflows.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    status: text('status').notNull().default('NOT_STARTED'),
    activeVersion: integer('active_version'),
    resultJson: text('result_json').notNull().default('{}'),
    userEditsJson: text('user_edits_json').notNull().default('{}'),
    approvedAt: text('approved_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_etsy_steps_workflow_state').on(
      table.workflowId,
      table.state,
    ),
  ],
);

export const etsyWorkflowVersions = sqliteTable(
  'etsy_workflow_versions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => etsyWorkflows.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    version: integer('version').notNull(),
    resultJson: text('result_json').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_etsy_versions_state_version').on(
      table.workflowId,
      table.state,
      table.version,
    ),
  ],
);

export const etsyWorkflowImages = sqliteTable(
  'etsy_workflow_images',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => etsyWorkflows.id, { onDelete: 'cascade' }),
    originalObjectKey: text('original_object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    originalContentType: text('original_content_type').notNull(),
    referenceKind: text('reference_kind').notNull().default('PRODUCT'),
    status: text('status').notNull().default('UPLOADED'),
    position: integer('position').notNull(),
    activeVersionId: text('active_version_id'),
    ...timestamps,
  },
  (table) => [
    index('idx_etsy_images_workflow_position').on(
      table.workflowId,
      table.position,
    ),
  ],
);

export const etsyListingImageSlots = sqliteTable(
  'etsy_listing_image_slots',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => etsyWorkflows.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    perspective: text('perspective').notNull(),
    instruction: text('instruction').notNull(),
    imageFormat: text('image_format').notNull().default('4:5'),
    status: text('status').notNull().default('DRAFT'),
    activeVersionId: text('active_version_id'),
    approvedAt: text('approved_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_etsy_slots_workflow_position').on(
      table.workflowId,
      table.position,
    ),
  ],
);

export const etsyListingImageSlotVersions = sqliteTable(
  'etsy_listing_image_slot_versions',
  {
    id: text('id').primaryKey(),
    slotId: text('slot_id')
      .notNull()
      .references(() => etsyListingImageSlots.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    taskPrompt: text('task_prompt').notNull(),
    objectKey: text('object_key'),
    contentType: text('content_type'),
    status: text('status').notNull().default('GENERATED'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_etsy_slot_versions').on(table.slotId, table.version),
  ],
);

export const etsyWorkflowImageVersions = sqliteTable(
  'etsy_workflow_image_versions',
  {
    id: text('id').primaryKey(),
    imageId: text('image_id')
      .notNull()
      .references(() => etsyWorkflowImages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    objectKey: text('object_key'),
    generationPrompt: text('generation_prompt').notNull(),
    userInstruction: text('user_instruction'),
    status: text('status').notNull().default('GENERATING'),
    errorCode: text('error_code'),
    approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_etsy_image_versions').on(table.imageId, table.version),
  ],
);

export const etsyWorkflowVariantPrices = sqliteTable(
  'etsy_workflow_variant_prices',
  {
    workflowId: text('workflow_id')
      .notNull()
      .references(() => etsyWorkflows.id, { onDelete: 'cascade' }),
    inventoryVariantId: text('inventory_variant_id').notNull(),
    etsyPriceCents: integer('etsy_price_cents'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_etsy_variant_prices').on(
      table.workflowId,
      table.inventoryVariantId,
    ),
  ],
);

export const etsyWorkflowConfig = sqliteTable('etsy_workflow_config', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});
