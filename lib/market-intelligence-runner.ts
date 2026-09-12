import {
  INVENTORY_SUPABASE_KEY,
  INVENTORY_SUPABASE_URL,
  inventoryHeaders,
} from './inventory-bridge';
import {
  MARKET_INTELLIGENCE_CONFIG,
  applyTrendHistory,
  calculateMarketSnapshot,
  classifyMarketChange,
  deduplicateAndScore,
  discoverClusters,
  generateResearchQueries,
  marketTokens,
  normalizeMarketText,
  researchPriority,
  type DiscoveredCluster,
  type MarketIntelligenceConfig,
  type MarketSnapshotValue,
  type PortfolioProduct,
} from './market-intelligence';
import { researchQuery, type MarketResearchBindings } from './market-research';
import {
  DEFAULT_PRICING_CONFIG,
  type MarketCategory,
  type SalesChannel,
} from './pricing-config';
import {
  calculatePhysicalRecommendation,
  type Competition,
  type Demand,
  type PhysicalPricingInput,
} from './pricing-engine';

export type MarketRunnerBindings = MarketResearchBindings & {
  DB: D1Database;
  INVENTORY_SUPABASE_SERVICE_ROLE_KEY?: string;
};

type Row = Record<string, unknown>;
type Catalog = {
  products: PortfolioProduct[];
  rawProducts: Row[];
  sales: Row[];
};

function string(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function parse(value: unknown, fallback: unknown = {}) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

async function stableId(prefix: string, value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  const hash = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${prefix}_${hash.slice(0, 24)}`;
}

function inventoryAuth(token: string) {
  return {
    ...inventoryHeaders(token),
    Prefer: 'return=representation',
  };
}

async function inventoryQuery(token: string, table: string, query: string) {
  const response = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/${table}?${query}`,
    {
      headers: inventoryAuth(token),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = payload as { message?: string } | null;
    throw new Error(
      error?.message || `Inventarabruf ${table}: Status ${response.status}.`,
    );
  }
  return rows(payload);
}

function productKind(product: Row) {
  const value = `${string(product.category)} ${string(product.name)} ${string(product.note)} ${string(product.print_files)}`;
  return /\b(stl|3mf|obj|digital|download)\b/i.test(value)
    ? 'digital'
    : 'physical';
}

function mapCatalogProduct(product: Row): PortfolioProduct {
  const variants = rows(product.variants);
  const mappedVariants = variants.map((variant, index) => ({
    id: string(variant.id, `variant-${index + 1}`),
    name: string(variant.name || variant.size),
    material: string(
      (variant.material as Row | undefined)?.name || variant.material_name,
    ),
    size: string(variant.size),
    widthMm: finite(variant.width_mm),
    heightMm: finite(variant.height_mm),
    depthMm: finite(variant.depth_mm),
    setSize: finite(variant.quantity),
    currentPriceCents: finite(variant.price_cents),
    productionCostCents: finite(variant.production_cost_cents),
  }));
  if (!mappedVariants.length) {
    mappedVariants.push({
      id: 'standard',
      name: string(product.size, 'Standard'),
      material: '',
      size: string(product.size),
      widthMm: finite(product.width_mm),
      heightMm: finite(product.height_mm),
      depthMm: finite(product.depth_mm),
      setSize: 1,
      currentPriceCents: finite(product.default_price_cents),
      productionCostCents: finite(product.production_cost_cents),
    });
  }
  const family =
    product.family && typeof product.family === 'object'
      ? (product.family as Row)
      : {};
  const designer =
    product.designer && typeof product.designer === 'object'
      ? (product.designer as Row)
      : {};
  const category = string(product.category, 'Unkategorisiert');
  const note = string(product.note);
  const tags = rows(product.tags)
    .map((tag) => string(tag.name || tag))
    .filter(Boolean);
  return {
    id: string(product.id),
    name: string(product.name, 'Unbenannter Artikel'),
    productType: string(family.name || category, category),
    category,
    description: note,
    tags,
    buyerWorld: string(product.buyer_world),
    material: Array.from(
      new Set(
        mappedVariants.map((variant) => variant.material).filter(Boolean),
      ),
    ).join(', '),
    style: string(product.style),
    functionLabel: string(product.function || product.function_label),
    motif: string(product.motif),
    person: string(product.person || designer.name),
    season: string(product.season),
    physicalOrDigital: productKind(product),
    updatedAt: string(product.updated_at || product.created_at),
    variants: mappedVariants,
  };
}

async function loadCatalog(token: string): Promise<Catalog> {
  const [rawProducts, sales, onlineSales] = await Promise.all([
    inventoryQuery(
      token,
      'products',
      'select=' +
        encodeURIComponent(
          '*,family:product_families(*),designer:designers(*),variants:product_variants(*,material:materials(*))',
        ) +
        '&deleted_at=is.null&archived_at=is.null&order=updated_at.desc',
    ),
    inventoryQuery(
      token,
      'sales',
      'select=' +
        encodeURIComponent(
          'id,date,discount_cents,is_cancelled,items:sale_items(product_id,article_variant_id,quantity,unit_sale_price_cents,unit_cost_price_cents)',
        ) +
        '&deleted_at=is.null&order=date.desc',
    ).catch(() => []),
    inventoryQuery(
      token,
      'online_sales',
      'select=id,product_id,date,quantity,sale_price_cents,channel&deleted_at=is.null&order=date.desc',
    ).catch(() => []),
  ]);
  const products = rawProducts
    .map(mapCatalogProduct)
    .filter((product) => product.id && product.name);
  if (!products.length)
    throw new Error(
      'Der autonome Katalogabruf liefert keine Produkte. Für den Wochenlauf ist INVENTORY_SUPABASE_SERVICE_ROLE_KEY erforderlich; bestehende Market Intelligence bleibt aktiv.',
    );
  return { products, rawProducts, sales: [...sales, ...onlineSales] };
}

async function catalogFingerprint(products: PortfolioProduct[]) {
  return stableId(
    'catalog',
    JSON.stringify(
      products
        .map((product) => [
          product.id,
          product.updatedAt,
          product.variants.map((variant) => variant.id),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ),
  );
}

async function loadConfig(db: D1Database) {
  const row = await db
    .prepare(
      "SELECT value_json AS valueJson FROM pricing_config_values WHERE key = 'market_intelligence'",
    )
    .first<{ valueJson: string }>()
    .catch(() => null);
  const override = (parse(row?.valueJson, {}) ||
    {}) as Partial<MarketIntelligenceConfig>;
  return {
    ...MARKET_INTELLIGENCE_CONFIG,
    ...override,
    relevantChangeThresholds: {
      ...MARKET_INTELLIGENCE_CONFIG.relevantChangeThresholds,
      ...override.relevantChangeThresholds,
    },
    majorChangeThresholds: {
      ...MARKET_INTELLIGENCE_CONFIG.majorChangeThresholds,
      ...override.majorChangeThresholds,
    },
  };
}

async function previousClusterState(db: D1Database, key: string) {
  return db
    .prepare(
      `SELECT c.id, c.last_researched_at AS lastResearchedAt,
              s.confidence, s.trend_state AS trendState,
              ch.change_type AS lastChange
       FROM market_clusters c
       LEFT JOIN market_snapshots s ON s.id = c.last_valid_snapshot_id
       LEFT JOIN market_changes ch ON ch.current_snapshot_id = s.id
       WHERE c.normalized_key = ?`,
    )
    .bind(key)
    .first<Row>();
}

async function syncClusters(
  db: D1Database,
  discovered: DiscoveredCluster[],
  products: PortfolioProduct[],
  instant: string,
) {
  const ids = new Map<string, string>();
  for (const cluster of discovered)
    ids.set(cluster.key, await stableId('cluster', cluster.key));
  for (const cluster of discovered) {
    const id = ids.get(cluster.key) as string;
    const prior = await previousClusterState(db, cluster.key);
    const days = prior?.lastResearchedAt
      ? (Date.now() - new Date(string(prior.lastResearchedAt)).getTime()) /
        86_400_000
      : null;
    const priority = researchPriority({
      isNew: !prior,
      confidence: prior?.confidence as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      daysSinceResearch: days,
      lastChange: prior?.lastChange as never,
      possibleTrend: prior?.trendState === 'POSSIBLE_TREND',
      seasonal: cluster.dimension === 'season',
    });
    await db
      .prepare(
        `INSERT INTO market_clusters
          (id,parent_id,level,dimension,label,normalized_key,search_terms_json,status,
           research_priority,research_frequency,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(normalized_key) DO UPDATE SET parent_id=excluded.parent_id,
           level=excluded.level,dimension=excluded.dimension,label=excluded.label,
           search_terms_json=excluded.search_terms_json,status='ACTIVE',
           research_priority=excluded.research_priority,
           research_frequency=excluded.research_frequency,updated_at=excluded.updated_at`,
      )
      .bind(
        id,
        cluster.parentKey ? ids.get(cluster.parentKey) || null : null,
        cluster.level,
        cluster.dimension,
        cluster.label,
        cluster.key,
        JSON.stringify(cluster.terms),
        prior ? 'ACTIVE' : 'NEW',
        priority.priority,
        priority.frequency,
        instant,
        instant,
      )
      .run();
    for (const productId of cluster.productIds) {
      const product = products.find((item) => item.id === productId);
      await db
        .prepare(
          `INSERT INTO market_cluster_products
            (cluster_id,product_id,variant_id,relevance,reasons_json,catalog_updated_at,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(cluster_id,product_id,variant_id) DO UPDATE SET
             relevance=excluded.relevance,reasons_json=excluded.reasons_json,
             catalog_updated_at=excluded.catalog_updated_at,updated_at=excluded.updated_at`,
        )
        .bind(
          id,
          productId,
          '',
          1,
          JSON.stringify(cluster.reasons[productId] || []),
          product?.updatedAt || null,
          instant,
          instant,
        )
        .run();
    }
    for (const query of generateResearchQueries(cluster)) {
      await db
        .prepare(
          `INSERT INTO market_research_queries
            (id,cluster_id,query,language,intent,status,discovered_from,created_at,updated_at)
           VALUES (?,?,?,?,?,'ACTIVE','portfolio-discovery',?,?)
           ON CONFLICT(cluster_id,query) DO UPDATE SET status='ACTIVE',updated_at=excluded.updated_at`,
        )
        .bind(
          await stableId('query', `${id}:${normalizeMarketText(query.query)}`),
          id,
          query.query,
          query.language,
          query.intent,
          instant,
          instant,
        )
        .run();
    }
  }
  return ids;
}

function internalSignal(sales: Row[], productIds: string[], now: Date) {
  const currentStart = now.getTime() - 30 * 86_400_000;
  const previousStart = now.getTime() - 60 * 86_400_000;
  let current = 0;
  let previous = 0;
  for (const sale of sales) {
    if (sale.is_cancelled === true) continue;
    const soldAt = new Date(string(sale.date)).getTime();
    const saleItems = rows(sale.items).length ? rows(sale.items) : [sale];
    for (const item of saleItems) {
      if (!productIds.includes(string(item.product_id))) continue;
      const quantity = Math.max(1, finite(item.quantity) || 1);
      if (soldAt >= currentStart) current += quantity;
      else if (soldAt >= previousStart) previous += quantity;
    }
  }
  if (!current && !previous) return { salesScore: null, salesTrend: null };
  return {
    salesScore: Math.min(1, Math.log1p(current) / Math.log(12)),
    salesTrend: (current - previous) / Math.max(1, current + previous),
  };
}

function snapshotFromRow(row: Row): MarketSnapshotValue {
  return {
    id: string(row.id),
    timestamp: string(row.timestamp),
    p25Cents: finite(row.p25Cents),
    medianCents: finite(row.medianCents),
    p75Cents: finite(row.p75Cents),
    p90Cents: finite(row.p90Cents),
    sampleSize: finite(row.sampleSize) || 0,
    effectiveSampleSize: finite(row.effectiveSampleSize) || 0,
    averageComparability: finite(row.averageComparability),
    sourceDiversity: finite(row.sourceDiversity) || 0,
    sellerDiversity: finite(row.sellerDiversity) || 0,
    externalDemandScore: finite(row.externalDemandScore),
    internalSalesScore: finite(row.internalSalesScore),
    internalSalesTrend: finite(row.internalSalesTrend),
    competitionScore: finite(row.competitionScore),
    observedTrend: finite(row.observedTrend),
    seasonalitySignal: finite(row.seasonalitySignal),
    adjustedTrend: finite(row.adjustedTrend),
    trendState: string(
      row.trendState,
      'BASELINE',
    ) as MarketSnapshotValue['trendState'],
    confidence: string(
      row.confidence,
      'LOW',
    ) as MarketSnapshotValue['confidence'],
  };
}

async function snapshotHistory(db: D1Database, clusterId: string) {
  const result = await db
    .prepare(
      `SELECT id,timestamp,p25_cents AS p25Cents,median_cents AS medianCents,
              p75_cents AS p75Cents,p90_cents AS p90Cents,sample_size AS sampleSize,
              effective_sample_size AS effectiveSampleSize,
              average_comparability AS averageComparability,source_diversity AS sourceDiversity,
              seller_diversity AS sellerDiversity,external_demand_score AS externalDemandScore,
              internal_sales_score AS internalSalesScore,internal_sales_trend AS internalSalesTrend,
              competition_score AS competitionScore,observed_trend AS observedTrend,
              seasonality_signal AS seasonalitySignal,adjusted_trend AS adjustedTrend,
              trend_state AS trendState,confidence
       FROM market_snapshots WHERE cluster_id=? AND status='VALID'
       ORDER BY timestamp DESC LIMIT 12`,
    )
    .bind(clusterId)
    .all<Row>();
  return (result.results || []).map(snapshotFromRow);
}

function demandClass(value: number | null): Demand {
  if (value == null) return 'unknown';
  if (value >= 0.78) return 'very_known';
  if (value >= 0.48) return 'known';
  return 'niche';
}

function competitionClass(value: number | null): Competition {
  if (value == null) return 'unknown';
  if (value >= 0.7) return 'high';
  if (value >= 0.38) return 'medium';
  return 'low';
}

async function pricingForChange(
  env: MarketRunnerBindings,
  changeId: string,
  snapshot: MarketSnapshotValue,
  affected: PortfolioProduct[],
  instant: string,
) {
  if (
    snapshot.medianCents == null ||
    snapshot.p25Cents == null ||
    snapshot.p75Cents == null ||
    snapshot.p90Cents == null
  )
    return 0;
  let count = 0;
  const channels: SalesChannel[] = [
    'etsy',
    'direct',
    'vinted',
    'ebay',
    'market',
  ];
  for (const product of affected.filter(
    (item) => item.physicalOrDigital !== 'digital',
  )) {
    const profile = await env.DB.prepare(
      `SELECT market_category AS marketCategory,tier,season,length_cm AS lengthCm,
                width_cm AS widthCm,height_cm AS heightCm,value_json AS valueJson
         FROM pricing_product_profiles WHERE inventory_product_id=?`,
    )
      .bind(product.id)
      .first<Row>();
    const category = string(
      profile?.marketCategory,
      'figures',
    ) as MarketCategory;
    if (!(category in DEFAULT_PRICING_CONFIG.marketQuantiles)) continue;
    const config = structuredClone(DEFAULT_PRICING_CONFIG);
    config.marketQuantiles[category] = {
      p25: snapshot.p25Cents / 100,
      median: snapshot.medianCents / 100,
      p75: snapshot.p75Cents / 100,
      p90: snapshot.p90Cents / 100,
    };
    const value = (parse(profile?.valueJson, {}) ||
      {}) as PhysicalPricingInput['value'];
    const safeValue = {
      complexity: finite(value.complexity) ?? 0.5,
      functionValue: finite(value.functionValue) ?? 0.5,
      giftValue: finite(value.giftValue) ?? 0.5,
      collectorValue: finite(value.collectorValue) ?? 0.5,
      personalization: finite(value.personalization) ?? 0,
      finish: finite(value.finish) ?? 0.5,
    };
    await env.DB.prepare(
      "UPDATE pricing_recommendations SET status='STALE_MARKET_DATA' WHERE inventory_product_id=? AND status='CURRENT'",
    )
      .bind(product.id)
      .run();
    for (const variant of product.variants) {
      const cogsCents = variant.productionCostCents;
      if (cogsCents == null || cogsCents <= 0) continue;
      for (const channel of channels) {
        const input: PhysicalPricingInput = {
          cogs: cogsCents / 100,
          channel,
          category: category as Exclude<MarketCategory, 'digital'>,
          tier: string(
            profile?.tier,
            'standard',
          ) as PhysicalPricingInput['tier'],
          lengthCm:
            finite(profile?.lengthCm) ??
            (variant.depthMm ? variant.depthMm / 10 : null),
          widthCm:
            finite(profile?.widthCm) ??
            (variant.widthMm ? variant.widthMm / 10 : null),
          heightCm:
            finite(profile?.heightCm) ??
            (variant.heightMm ? variant.heightMm / 10 : null),
          value: safeValue,
          demand: demandClass(snapshot.externalDemandScore),
          competition: competitionClass(snapshot.competitionScore),
          config,
        };
        const result = calculatePhysicalRecommendation(input);
        const previous = await env.DB.prepare(
          `SELECT recommended_price_cents AS price FROM pricing_recommendations
             WHERE inventory_product_id=? AND inventory_variant_id=? AND channel=?
             ORDER BY created_at DESC LIMIT 1`,
        )
          .bind(product.id, variant.id, channel)
          .first<{ price: number | null }>();
        const recommendationId = crypto.randomUUID();
        const next =
          result.recommendedPrice == null
            ? null
            : Math.round(result.recommendedPrice * 100);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO pricing_recommendations
                (id,inventory_product_id,inventory_variant_id,channel,recommendation_kind,
                 config_version,cogs_cents,active_price_snapshot_cents,recommended_price_cents,
                 input_json,result_json,status,market_change_id,created_by,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,'MARKET_UPDATED_REVIEW',?,NULL,?)`,
          ).bind(
            recommendationId,
            product.id,
            variant.id,
            channel,
            'physical',
            config.version,
            cogsCents,
            variant.currentPriceCents,
            next,
            JSON.stringify(input),
            JSON.stringify(result),
            changeId,
            instant,
          ),
          env.DB.prepare(
            `INSERT INTO pricing_impacts
                (id,market_change_id,product_id,variant_id,channel,
                 previous_recommendation_cents,new_recommendation_cents,
                 absolute_difference_cents,percentage_difference,status,recommendation_id,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,'REVIEW_REQUIRED',?,?)`,
          ).bind(
            crypto.randomUUID(),
            changeId,
            product.id,
            variant.id,
            channel,
            previous?.price ?? null,
            next,
            next == null || previous?.price == null
              ? null
              : next - previous.price,
            next == null || !previous?.price
              ? null
              : (next - previous.price) / previous.price,
            recommendationId,
            instant,
          ),
        ]);
        count += 1;
      }
    }
  }
  return count;
}

export async function runMarketIntelligence(
  env: MarketRunnerBindings,
  options: {
    inventoryAccessToken?: string;
    now?: Date;
    maxClusters?: number;
  } = {},
) {
  const now = options.now || new Date();
  const instant = now.toISOString();
  const runId = `market_run_${crypto.randomUUID()}`;
  let runKind = 'INCREMENTAL_MARKET_UPDATE';
  const audit: Row = { clusters: [], sources: [], errors: [] };
  const counters = {
    clusters: 0,
    queries: 0,
    found: 0,
    rejected: 0,
    comparable: 0,
    snapshots: 0,
    changes: 0,
    pricingImpacts: 0,
  };
  await env.DB.prepare(
    `INSERT INTO market_research_runs
        (id,run_kind,status,started_at,error_json,audit_json)
       VALUES (?,?,'RUNNING',?,'[]','{}')`,
  )
    .bind(runId, runKind, instant)
    .run();
  try {
    const token =
      options.inventoryAccessToken ||
      env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY ||
      INVENTORY_SUPABASE_KEY;
    const catalog = await loadCatalog(token);
    const fingerprint = await catalogFingerprint(catalog.products);
    const previousRun = await env.DB.prepare(
      "SELECT id FROM market_research_runs WHERE status IN ('SUCCESS','PARTIAL') AND id != ? LIMIT 1",
    )
      .bind(runId)
      .first();
    if (!previousRun) runKind = 'FULL_BASELINE_DISCOVERY';
    const config = await loadConfig(env.DB);
    const discovered = discoverClusters(catalog.products);
    const ids = await syncClusters(
      env.DB,
      discovered,
      catalog.products,
      instant,
    );
    const maxClusters = Math.max(
      1,
      options.maxClusters || config.maxClustersPerRun,
    );
    const clusterStateRows = await env.DB.prepare(
      `SELECT normalized_key AS normalizedKey,status,research_priority AS researchPriority,
              last_researched_at AS lastResearchedAt FROM market_clusters`,
    ).all<Row>();
    const clusterStates = new Map(
      (clusterStateRows.results || []).map((row) => [
        string(row.normalizedKey),
        row,
      ]),
    );
    const selected = [...discovered]
      .sort((a, b) => {
        const left = clusterStates.get(a.key);
        const right = clusterStates.get(b.key);
        const leftNew =
          left?.status === 'NEW' || !left?.lastResearchedAt ? 1 : 0;
        const rightNew =
          right?.status === 'NEW' || !right?.lastResearchedAt ? 1 : 0;
        return (
          rightNew - leftNew ||
          (finite(right?.researchPriority) || 0) -
            (finite(left?.researchPriority) || 0) ||
          b.productIds.length - a.productIds.length ||
          a.level - b.level
        );
      })
      .slice(0, maxClusters);
    if (selected.length < discovered.length)
      (audit.errors as unknown[]).push({
        code: 'RESEARCH_BUDGET',
        message: `${discovered.length - selected.length} Cluster bleiben für folgende Wochenläufe priorisiert.`,
      });
    counters.clusters = selected.length;

    for (const cluster of selected) {
      const clusterId = ids.get(cluster.key) as string;
      const clusterProducts = catalog.products.filter((product) =>
        cluster.productIds.includes(product.id),
      );
      const queryRows = await env.DB.prepare(
        `SELECT id,query FROM market_research_queries
           WHERE cluster_id=? AND status='ACTIVE'
           ORDER BY COALESCE(yield_score,1) DESC,created_at ASC LIMIT ?`,
      )
        .bind(clusterId, config.maxQueriesPerCluster)
        .all<{ id: string; query: string }>();
      const candidates = [];
      let queryIndex = 0;
      for (const queryRow of queryRows.results || []) {
        const before = new Set(
          candidates.map((candidate) => candidate.sourceUrl),
        ).size;
        const result = await researchQuery(
          queryRow.query,
          config.maxResultsPerQuery,
          env,
        );
        candidates.push(...result.candidates);
        (audit.sources as unknown[]).push(
          ...result.attempts.map((attempt) => ({ clusterId, ...attempt })),
        );
        counters.queries += 1;
        counters.found += result.attempts.reduce(
          (sum, attempt) => sum + attempt.found,
          0,
        );
        const after = new Set(
          candidates.map((candidate) => candidate.sourceUrl),
        ).size;
        const newRate =
          (after - before) /
          Math.max(
            1,
            result.attempts.reduce((sum, attempt) => sum + attempt.found, 0),
          );
        await env.DB.prepare(
          'UPDATE market_research_queries SET yield_score=?,last_used_at=?,updated_at=? WHERE id=?',
        )
          .bind(newRate, instant, instant, queryRow.id)
          .run();
        queryIndex += 1;
        if (queryIndex >= 2 && newRate < config.querySaturationNewResultRate)
          break;
      }
      const observations = await deduplicateAndScore(
        clusterProducts,
        candidates,
      );
      const seedTerms = new Set(cluster.terms);
      const discoveredTerms = new Map<string, number>();
      for (const observation of observations) {
        if (observation.comparabilityScore < config.minComparability) continue;
        for (const term of marketTokens(observation.title)) {
          if (!seedTerms.has(term))
            discoveredTerms.set(term, (discoveredTerms.get(term) || 0) + 1);
        }
      }
      for (const [term, frequency] of [...discoveredTerms.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)) {
        const query = `${cluster.label} ${term}`;
        await env.DB.prepare(
          `INSERT INTO market_research_queries
              (id,cluster_id,query,language,intent,status,yield_score,discovered_from,created_at,updated_at)
             VALUES (?,?,?,'mixed','expansion','ACTIVE',?,'comparable-listings',?,?)
             ON CONFLICT(cluster_id,query) DO UPDATE SET status='ACTIVE',updated_at=excluded.updated_at`,
        )
          .bind(
            await stableId(
              'query',
              `${clusterId}:${normalizeMarketText(query)}`,
            ),
            clusterId,
            query,
            frequency / Math.max(1, observations.length),
            instant,
            instant,
          )
          .run();
      }
      counters.rejected += observations.filter(
        (row) => row.comparabilityScore < config.minComparability,
      ).length;
      counters.comparable += observations.filter(
        (row) => row.comparabilityScore >= config.minComparability,
      ).length;
      for (const observation of observations) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO market_observations
              (id,run_id,cluster_id,source,source_url,platform,listing_key,researched_at,
               title,seller,physical_or_digital,currency,regular_price_cents,sale_price_cents,
               shipping_price_cents,visible_customer_price_cents,product_type,style,motif,person,
               dimensions_json,variants_json,material,personalization,bundle_size,review_count,rating,
               popularity_json,comparability_score,source_quality_score,raw_metadata_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
          .bind(
            crypto.randomUUID(),
            runId,
            clusterId,
            observation.source,
            observation.sourceUrl,
            observation.platform || null,
            observation.listingKey,
            instant,
            observation.title,
            observation.seller || null,
            observation.physicalOrDigital,
            observation.currency || null,
            observation.regularPriceCents ?? null,
            observation.salePriceCents ?? null,
            observation.shippingPriceCents ?? null,
            observation.visibleCustomerPriceCents ?? null,
            observation.productType || null,
            observation.style || null,
            observation.motif || null,
            observation.person || null,
            JSON.stringify({
              widthMm: observation.widthMm,
              heightMm: observation.heightMm,
              depthMm: observation.depthMm,
            }),
            '[]',
            observation.material || null,
            observation.personalization == null
              ? null
              : observation.personalization
                ? 1
                : 0,
            observation.bundleSize ?? null,
            observation.reviewCount ?? null,
            observation.rating ?? null,
            JSON.stringify(observation.popularitySignals || {}),
            observation.comparabilityScore,
            observation.sourceQualityScore,
            JSON.stringify(observation.rawMetadata || {}),
          )
          .run();
      }
      const internal = internalSignal(catalog.sales, cluster.productIds, now);
      let snapshot = calculateMarketSnapshot(observations, internal, config);
      const history = await snapshotHistory(env.DB, clusterId);
      snapshot = applyTrendHistory(
        { ...snapshot, timestamp: instant },
        history,
        config,
      );
      const valid = snapshot.sampleSize > 0 && snapshot.medianCents != null;
      const snapshotId = `snapshot_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO market_snapshots
            (id,run_id,cluster_id,timestamp,status,demand_score,external_demand_score,
             internal_sales_score,internal_sales_trend,competition_score,observed_trend,
             seasonality_signal,adjusted_trend,trend_state,p25_cents,median_cents,p75_cents,p90_cents,
             sample_size,effective_sample_size,average_comparability,source_diversity,seller_diversity,
             confidence,source_distribution_json,diagnostics_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          snapshotId,
          runId,
          clusterId,
          instant,
          valid ? 'VALID' : 'INSUFFICIENT_DATA',
          snapshot.externalDemandScore,
          snapshot.externalDemandScore,
          snapshot.internalSalesScore,
          snapshot.internalSalesTrend,
          snapshot.competitionScore,
          snapshot.observedTrend,
          snapshot.seasonalitySignal,
          snapshot.adjustedTrend,
          snapshot.trendState,
          snapshot.p25Cents,
          snapshot.medianCents,
          snapshot.p75Cents,
          snapshot.p90Cents,
          snapshot.sampleSize,
          snapshot.effectiveSampleSize,
          snapshot.averageComparability,
          snapshot.sourceDiversity,
          snapshot.sellerDiversity,
          snapshot.confidence,
          JSON.stringify(
            Object.fromEntries(
              observations
                .map((row) => row.source)
                .map((source) => [
                  source,
                  observations.filter((row) => row.source === source).length,
                ]),
            ),
          ),
          JSON.stringify({
            physicalDigitalSeparated: true,
            ownPricesExcluded: true,
          }),
        )
        .run();
      counters.snapshots += 1;
      if (!valid) {
        (audit.errors as unknown[]).push({
          clusterId,
          code: 'LOW_DATA',
          message: 'Keine belastbare externe Preisstichprobe.',
        });
        continue;
      }
      await env.DB.prepare(
        `UPDATE market_clusters SET last_researched_at=?,last_valid_snapshot_id=?,status='ACTIVE',updated_at=? WHERE id=?`,
      )
        .bind(instant, snapshotId, instant, clusterId)
        .run();
      const change = classifyMarketChange(history[0] || null, snapshot, config);
      const changeId = `change_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO market_changes
            (id,cluster_id,previous_snapshot_id,current_snapshot_id,change_type,confidence,
             before_json,after_json,affected_product_ids_json,affected_variant_ids_json,
             sources_json,explanation_json,detected_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          changeId,
          clusterId,
          history[0]?.id || null,
          snapshotId,
          change.type,
          snapshot.confidence,
          history[0] ? JSON.stringify(history[0]) : null,
          JSON.stringify(snapshot),
          JSON.stringify(cluster.productIds),
          JSON.stringify(
            clusterProducts.flatMap((product) =>
              product.variants.map((variant) => variant.id),
            ),
          ),
          JSON.stringify(
            Array.from(new Set(observations.map((row) => row.sourceUrl))),
          ),
          JSON.stringify(change.explanations),
          instant,
        )
        .run();
      if (change.type !== 'NO_CHANGE') counters.changes += 1;
      if (change.type === 'RELEVANT_CHANGE' || change.type === 'MAJOR_CHANGE') {
        const impacts = await pricingForChange(
          env,
          changeId,
          snapshot,
          clusterProducts,
          instant,
        );
        counters.pricingImpacts += impacts;
        for (const productId of cluster.productIds) {
          const workflows = await env.DB.prepare(
            'SELECT id FROM etsy_workflows WHERE inventory_product_id=? AND completed_at IS NULL',
          )
            .bind(productId)
            .all<{ id: string }>();
          for (const workflow of workflows.results || []) {
            await env.DB.batch([
              env.DB.prepare(
                "UPDATE etsy_workflow_steps SET status='NEEDS_REVIEW',updated_at=? WHERE workflow_id=? AND state='VARIANT_PRICING'",
              ).bind(instant, workflow.id),
              env.DB.prepare(
                "UPDATE etsy_workflow_steps SET status='STALE_KEYWORDS',updated_at=? WHERE workflow_id=? AND state='KEYWORD_RESEARCH'",
              ).bind(instant, workflow.id),
              env.DB.prepare(
                "UPDATE etsy_workflow_steps SET status=CASE WHEN status='APPROVED' THEN 'NEEDS_REVIEW' ELSE status END,updated_at=? WHERE workflow_id=? AND state IN ('TITLE','DESCRIPTION')",
              ).bind(instant, workflow.id),
              env.DB.prepare(
                'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
              ).bind(instant, workflow.id),
            ]);
          }
        }
        await env.DB.prepare(
          `INSERT INTO activity_events
              (id,kind,title,detail,occurred_at,payload_json)
             VALUES (?,?,?,?,?,?)`,
        )
          .bind(
            crypto.randomUUID(),
            'market-intelligence',
            change.type === 'MAJOR_CHANGE'
              ? `Wichtige Marktänderung: ${cluster.label}`
              : `Marktupdate: ${cluster.label}`,
            `${snapshot.confidence} Confidence · ${snapshot.sampleSize} Vergleichsangebote · ${impacts} Preisempfehlungen zur Prüfung`,
            instant,
            JSON.stringify({
              clusterId,
              changeId,
              productId: cluster.productIds[0] || null,
              productIds: cluster.productIds,
              changeType: change.type,
            }),
          )
          .run();
      }
      (audit.clusters as unknown[]).push({
        clusterId,
        label: cluster.label,
        observations: observations.length,
        snapshotId,
        changeType: change.type,
      });
    }

    const hasErrors = (audit.errors as unknown[]).length > 0;
    const status =
      counters.snapshots === 0 ? 'FAILED' : hasErrors ? 'PARTIAL' : 'SUCCESS';
    await env.DB.prepare(
      `UPDATE market_research_runs SET run_kind=?,status=?,finished_at=?,catalog_fingerprint=?,
           cluster_count=?,query_count=?,found_count=?,rejected_count=?,comparable_count=?,
           snapshot_count=?,change_count=?,pricing_impact_count=?,error_json=?,audit_json=? WHERE id=?`,
    )
      .bind(
        runKind,
        status,
        new Date().toISOString(),
        fingerprint,
        counters.clusters,
        counters.queries,
        counters.found,
        counters.rejected,
        counters.comparable,
        counters.snapshots,
        counters.changes,
        counters.pricingImpacts,
        JSON.stringify(audit.errors),
        JSON.stringify(audit),
        runId,
      )
      .run();
    return { runId, runKind, status, ...counters, errors: audit.errors };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Market-Intelligence-Lauf fehlgeschlagen.';
    await env.DB.prepare(
      `UPDATE market_research_runs SET run_kind=?,status='RESEARCH_FAILED',finished_at=?,error_json=?,audit_json=? WHERE id=?`,
    )
      .bind(
        runKind,
        new Date().toISOString(),
        JSON.stringify([{ message }]),
        JSON.stringify(audit),
        runId,
      )
      .run();
    throw new Error(message);
  }
}
