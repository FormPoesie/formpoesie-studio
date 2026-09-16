export type MarketConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type MarketChangeType =
  | 'NO_CHANGE'
  | 'MINOR_CHANGE'
  | 'RELEVANT_CHANGE'
  | 'MAJOR_CHANGE';
export type TrendState =
  | 'BASELINE'
  | 'POSSIBLE_TREND'
  | 'CONFIRMED_TREND'
  | 'REJECTED_TREND';

export type MarketIntelligenceConfig = {
  maxClustersPerRun: number;
  maxQueriesPerCluster: number;
  maxResultsPerQuery: number;
  minComparability: number;
  minSampleSize: number;
  trendConfirmationPeriods: number;
  querySaturationNewResultRate: number;
  sellerWeightCap: number;
  relevantChangeThresholds: {
    medianRate: number;
    scoreDelta: number;
    trendDelta: number;
  };
  majorChangeThresholds: {
    medianRate: number;
    scoreDelta: number;
    trendDelta: number;
  };
};

export const MARKET_INTELLIGENCE_CONFIG: MarketIntelligenceConfig = {
  maxClustersPerRun: 1,
  maxQueriesPerCluster: 4,
  maxResultsPerQuery: 8,
  minComparability: 0.5,
  minSampleSize: 5,
  trendConfirmationPeriods: 3,
  querySaturationNewResultRate: 0.12,
  sellerWeightCap: 2.5,
  relevantChangeThresholds: {
    medianRate: 0.1,
    scoreDelta: 0.14,
    trendDelta: 0.2,
  },
  majorChangeThresholds: {
    medianRate: 0.22,
    scoreDelta: 0.28,
    trendDelta: 0.42,
  },
};

export type PortfolioVariant = {
  id: string;
  name?: string;
  material?: string;
  size?: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  setSize?: number | null;
  currentPriceCents?: number | null;
  productionCostCents?: number | null;
};

export type PortfolioProduct = {
  id: string;
  name: string;
  productType: string;
  category?: string;
  description?: string;
  tags?: string[];
  buyerWorld?: string;
  material?: string;
  style?: string;
  functionLabel?: string;
  motif?: string;
  person?: string;
  season?: string;
  physicalOrDigital?: 'physical' | 'digital';
  updatedAt?: string;
  variants: PortfolioVariant[];
};

export type DiscoveredCluster = {
  key: string;
  parentKey: string | null;
  level: number;
  dimension: string;
  label: string;
  terms: string[];
  productIds: string[];
  reasons: Record<string, string[]>;
};

export type ListingCandidate = {
  source: string;
  sourceUrl: string;
  platform?: string | null;
  title: string;
  seller?: string | null;
  physicalOrDigital: 'physical' | 'digital' | 'unknown';
  currency?: string | null;
  regularPriceCents?: number | null;
  salePriceCents?: number | null;
  shippingPriceCents?: number | null;
  visibleCustomerPriceCents?: number | null;
  productType?: string | null;
  material?: string | null;
  style?: string | null;
  motif?: string | null;
  person?: string | null;
  personalization?: boolean | null;
  bundleSize?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
  popularitySignals?: Record<string, number | string | boolean | null>;
  sourceQualityScore: number;
  rawMetadata?: Record<string, unknown>;
};

export type ScoredObservation = ListingCandidate & {
  listingKey: string;
  comparabilityScore: number;
};

export type MarketSnapshotValue = {
  id?: string;
  timestamp?: string;
  p25Cents: number | null;
  medianCents: number | null;
  p75Cents: number | null;
  p90Cents: number | null;
  minCents?: number | null;
  maxCents?: number | null;
  sampleSize: number;
  effectiveSampleSize: number;
  averageComparability: number | null;
  sourceDiversity: number;
  sellerDiversity: number;
  externalDemandScore: number | null;
  internalSalesScore: number | null;
  internalSalesTrend: number | null;
  competitionScore: number | null;
  observedTrend: number | null;
  seasonalitySignal: number | null;
  adjustedTrend: number | null;
  trendState: TrendState;
  confidence: MarketConfidence;
  confidenceScore?: number;
  oldestObservation?: string | null;
  newestObservation?: string | null;
};

const STOP_WORDS = new Set([
  'und',
  'oder',
  'mit',
  'ohne',
  'für',
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'von',
  'aus',
  'im',
  'in',
  'am',
  'an',
  'auf',
  'the',
  'and',
  'with',
  'for',
  'from',
  'this',
  'that',
  'set',
  'neu',
  'new',
  'formpoesie',
]);

export function clamp(value: number, minimum = 0, maximum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeMarketText(value: unknown) {
  return (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  )
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function marketTokens(...values: unknown[]) {
  const normalized = normalizeMarketText(values.filter(Boolean).join(' '))
    .replace(/\b(?:tea\s*light|candle)\s+holders?\b/g, 'teelichthalter')
    .replace(/\bset\s+of\s+(?:3|three)\b/g, 'trio');
  const aliases: Record<string, string> = {
    '3er': 'trio',
    three: 'trio',
    geister: 'geist',
    ghosts: 'geist',
    ghost: 'geist',
    tealight: 'teelichthalter',
    candleholder: 'teelichthalter',
    candleholders: 'teelichthalter',
  };
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => aliases[token] || token)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  );
}

function englishResearchLabel(label: string) {
  const translations: Record<string, string> = {
    geist: 'ghost',
    trio: 'set',
    teelichthalter: 'tealight holder',
    kerzenhalter: 'candle holder',
    halloween: 'Halloween',
  };
  return marketTokens(label)
    .map((token) => translations[token] || token)
    .join(' ');
}

function germanResearchLabel(label: string) {
  const translations: Record<string, string> = {
    geist: 'Geister',
    trio: '3er Set',
    teelichthalter: 'Teelichthalter',
  };
  return marketTokens(label)
    .map((token) => translations[token] || token)
    .join(' ');
}

function clusterKey(dimension: string, value: string) {
  return `${dimension}:${normalizeMarketText(value).replace(/\s+/g, '-')}`;
}

export function discoverClusters(
  products: PortfolioProduct[],
): DiscoveredCluster[] {
  const clusters = new Map<string, DiscoveredCluster>();
  const add = (
    product: PortfolioProduct,
    dimension: string,
    label: string,
    level: number,
    parentKey: string | null,
    reasons: string[],
  ) => {
    if (!normalizeMarketText(label)) return;
    const key = clusterKey(dimension, label);
    const current = clusters.get(key) || {
      key,
      parentKey,
      level,
      dimension,
      label: label.trim(),
      terms: [],
      productIds: [],
      reasons: {},
    };
    current.terms = Array.from(
      new Set([
        ...current.terms,
        ...marketTokens(label, product.name, product.tags),
      ]),
    ).slice(0, 20);
    if (!current.productIds.includes(product.id))
      current.productIds.push(product.id);
    current.reasons[product.id] = Array.from(
      new Set([...(current.reasons[product.id] || []), ...reasons]),
    );
    clusters.set(key, current);
  };

  for (const product of products) {
    const family = product.productType || product.category || product.name;
    const familyKey = clusterKey('product_type', family);
    add(product, 'product', product.name, 0, familyKey, [
      'Konkreter finalisierter Artikel',
    ]);
    add(product, 'product_type', family, 1, null, [
      'Produkttyp aus dem Sortiment',
    ]);
    const dimensions: Array<[string, string | undefined, number]> = [
      ['function', product.functionLabel, 2],
      ['style', product.style || product.buyerWorld, 3],
      ['theme', product.motif, 3],
      ['person', product.person, 4],
      ['season', product.season, 3],
      ['material', product.material, 3],
    ];
    for (const [dimension, label, level] of dimensions) {
      if (label)
        add(product, dimension, label, level, familyKey, [
          `${dimension} aus den Produktdaten`,
        ]);
    }
  }

  return [...clusters.values()]
    .filter(
      (cluster) =>
        cluster.dimension === 'product' || cluster.productIds.length > 1,
    )
    .sort(
      (a, b) => a.level - b.level || b.productIds.length - a.productIds.length,
    );
}

export function generateResearchQueries(cluster: DiscoveredCluster) {
  const label = cluster.label.trim();
  const terms = cluster.terms.filter(
    (term) => !normalizeMarketText(label).includes(term),
  );
  const productSpecific = cluster.dimension === 'product';
  const base = [
    ...(productSpecific
      ? [
          { query: `${germanResearchLabel(label)} Halloween 3D Druck kaufen`, language: 'de', intent: 'comparison' },
          { query: `${englishResearchLabel(label)} Halloween 3D printed buy`, language: 'en', intent: 'comparison' },
          { query: `${germanResearchLabel(label)} physisch PLA FDM Etsy`, language: 'de', intent: 'comparison' },
          { query: `${englishResearchLabel(label)} physical PLA FDM Etsy`, language: 'en', intent: 'comparison' },
        ]
      : []),
    { query: `${label} Preis Etsy eBay kaufen`, language: 'de', intent: 'buy' },
    { query: `${label} kaufen`, language: 'de', intent: 'buy' },
    { query: `${label} handgemacht`, language: 'de', intent: 'comparison' },
    ...(!productSpecific
      ? [{ query: `${label} 3D Druck`, language: 'de', intent: 'comparison' }]
      : []),
    { query: `${label} price Etsy eBay`, language: 'en', intent: 'buy' },
    { query: `${label} handmade`, language: 'en', intent: 'comparison' },
    ...terms.slice(0, 3).map((term) => ({
      query: `${label} ${term}`,
      language: 'mixed',
      intent: 'discovery',
    })),
  ];
  const seen = new Set<string>();
  return base.filter((item) => {
    const key = normalizeMarketText(item.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / union.size;
}

function dimensionScore(product: PortfolioProduct, listing: ListingCandidate) {
  const productDimensions = product.variants
    .flatMap((variant) => [variant.widthMm, variant.heightMm, variant.depthMm])
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const listingDimensions = [
    listing.widthMm,
    listing.heightMm,
    listing.depthMm,
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  if (!productDimensions.length || !listingDimensions.length) return null;
  const productMax = Math.max(...productDimensions);
  const listingMax = Math.max(...listingDimensions);
  return clamp(
    1 - Math.abs(productMax - listingMax) / Math.max(productMax, listingMax),
  );
}

export function scoreComparability(
  product: PortfolioProduct,
  listing: ListingCandidate,
) {
  const expectedKind = product.physicalOrDigital || 'physical';
  if (
    listing.physicalOrDigital !== 'unknown' &&
    listing.physicalOrDigital !== expectedKind
  )
    return 0;
  const productTerms = marketTokens(
    product.name,
    product.productType,
    product.category,
    product.description,
    product.tags,
    product.buyerWorld,
    product.style,
    product.functionLabel,
    product.motif,
    product.person,
  );
  const listingTerms = marketTokens(
    listing.title,
    listing.productType,
    listing.style,
    listing.motif,
    listing.person,
    listing.material,
  );
  const typeTerms = marketTokens(product.productType, product.category);
  const nameTerms = marketTokens(product.name, product.motif, product.person);
  const typeOverlap = jaccard(typeTerms, listingTerms);
  const nameOverlap = jaccard(nameTerms, listingTerms);
  const coreNameMatches = new Set(nameTerms.filter((term) => listingTerms.includes(term))).size;
  let score =
    0.12 +
    jaccard(productTerms, listingTerms) * 0.28 +
    (typeOverlap > 0 ? 0.24 + typeOverlap * 0.08 : 0) +
    (nameOverlap > 0 ? 0.16 + nameOverlap * 0.08 : 0);
  // Two matching semantic core terms (for example Geist +
  // Teelichthalter) are stronger evidence than a diluted Jaccard score for a
  // long product name. Manufacturing kind is validated separately.
  if (coreNameMatches >= 2) score += 0.18;
  const material = jaccard(
    marketTokens(product.material),
    marketTokens(listing.material),
  );
  if (product.material && listing.material) score += material * 0.12;
  const dimensions = dimensionScore(product, listing);
  if (dimensions != null) score += dimensions * 0.1;
  const expectedBundle = Math.max(
    1,
    ...product.variants.map((variant) => variant.setSize || 1),
  );
  if (listing.bundleSize)
    score += listing.bundleSize === expectedBundle ? 0.08 : -0.08;
  return clamp(score);
}

export async function listingKey(listing: ListingCandidate) {
  let canonicalUrl = listing.sourceUrl;
  try {
    const url = new URL(listing.sourceUrl);
    url.hash = '';
    for (const key of url.searchParams.keys())
      if (/^(utm_|ref$|src$|campaign)/i.test(key)) url.searchParams.delete(key);
    canonicalUrl = url.toString();
  } catch {
    // The fallback signature still keeps malformed source values deterministic.
  }
  const identity = normalizeMarketText(
    `${canonicalUrl}|${listing.seller || ''}|${listing.title}|${
      listing.visibleCustomerPriceCents ??
      listing.salePriceCents ??
      listing.regularPriceCents ??
      ''
    }`,
  );
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function deduplicateAndScore(
  products: PortfolioProduct[],
  candidates: ListingCandidate[],
) {
  const deduplicated = new Map<string, ScoredObservation>();
  for (const candidate of candidates) {
    const key = await listingKey(candidate);
    const comparabilityScore = Math.max(
      0,
      ...products.map((product) => scoreComparability(product, candidate)),
    );
    const scored = { ...candidate, listingKey: key, comparabilityScore };
    const previous = deduplicated.get(key);
    if (
      !previous ||
      scored.sourceQualityScore * scored.comparabilityScore >
        previous.sourceQualityScore * previous.comparabilityScore
    )
      deduplicated.set(key, scored);
  }
  return [...deduplicated.values()];
}

function visiblePrice(observation: ScoredObservation) {
  return (
    observation.visibleCustomerPriceCents ??
    observation.salePriceCents ??
    observation.regularPriceCents ??
    null
  );
}

function weightedQuantile(
  rows: Array<{ value: number; weight: number }>,
  quantile: number,
) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= total * quantile) return Math.round(row.value);
  }
  return Math.round(sorted[sorted.length - 1].value);
}

export function calculateMarketSnapshot(
  observations: ScoredObservation[],
  internal?: { salesScore?: number | null; salesTrend?: number | null },
  config = MARKET_INTELLIGENCE_CONFIG,
  expectedKind: 'physical' | 'digital' = 'physical',
): MarketSnapshotValue {
  const candidates = observations.filter(
    (row) =>
      row.comparabilityScore >= config.minComparability &&
      row.physicalOrDigital === expectedKind &&
      (!row.currency || row.currency === 'EUR') &&
      row.rawMetadata?.bundleAmbiguous !== true &&
      (visiblePrice(row) || 0) > 0,
  );
  const sortedPrices = candidates
    .map((row) => visiblePrice(row) as number)
    .sort((left, right) => left - right);
  const quantile = (position: number) => {
    if (!sortedPrices.length) return null;
    const index = (sortedPrices.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sortedPrices[lower] + (sortedPrices[upper] - sortedPrices[lower]) * (index - lower);
  };
  const q25 = quantile(0.25);
  const q75 = quantile(0.75);
  const iqr = q25 != null && q75 != null ? q75 - q25 : null;
  const usable = candidates.length >= 5 && iqr != null && iqr > 0
    ? candidates.filter((row) => {
        const price = visiblePrice(row) as number;
        return price >= (q25 as number) - 1.5 * iqr && price <= (q75 as number) + 1.5 * iqr;
      })
    : candidates;
  const sellers = new Map<string, number>();
  const weighted = usable.map((row) => {
    const seller = normalizeMarketText(
      row.seller || new URL(row.sourceUrl).hostname,
    );
    const sellerCount = (sellers.get(seller) || 0) + 1;
    sellers.set(seller, sellerCount);
    const sellerFactor = 1 / Math.max(1, sellerCount / config.sellerWeightCap);
    return {
      value: visiblePrice(row) as number,
      weight:
        clamp(row.comparabilityScore) *
        clamp(row.sourceQualityScore) *
        sellerFactor,
    };
  });
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  const weightSquares = weighted.reduce((sum, row) => sum + row.weight ** 2, 0);
  const effectiveSampleSize = weightSquares
    ? totalWeight ** 2 / weightSquares
    : 0;
  const averageComparability = usable.length
    ? usable.reduce((sum, row) => sum + row.comparabilityScore, 0) /
      usable.length
    : null;
  const sourceDiversity = new Set(usable.map((row) => row.source)).size;
  const sellerDiversity = new Set(
    usable.map((row) => row.seller || new URL(row.sourceUrl).hostname),
  ).size;
  const popularity = usable.flatMap((row) => {
    const values = [row.reviewCount, row.rating && row.rating / 5];
    return values.filter((value): value is number => typeof value === 'number');
  });
  const externalDemandScore = popularity.length
    ? clamp(
        popularity.reduce(
          (sum, value) => sum + Math.log1p(Math.max(0, value)),
          0,
        ) /
          popularity.length /
          5,
      )
    : null;
  const competitionScore = usable.length
    ? clamp(Math.log1p(sellerDiversity) / Math.log(12))
    : null;
  const confidencePoints =
    Math.min(1, effectiveSampleSize / Math.max(1, config.minSampleSize)) * 0.4 +
    (averageComparability || 0) * 0.3 +
    Math.min(1, sourceDiversity / 3) * 0.15 +
    Math.min(1, sellerDiversity / 5) * 0.15;
  const confidence: MarketConfidence =
    confidencePoints >= 0.72
      ? 'HIGH'
      : confidencePoints >= 0.45
        ? 'MEDIUM'
        : 'LOW';
  return {
    minCents: usable.length ? Math.min(...usable.map((row) => visiblePrice(row) as number)) : null,
    p25Cents: weightedQuantile(weighted, 0.25),
    medianCents: weightedQuantile(weighted, 0.5),
    p75Cents: weightedQuantile(weighted, 0.75),
    p90Cents: weightedQuantile(weighted, 0.9),
    maxCents: usable.length ? Math.max(...usable.map((row) => visiblePrice(row) as number)) : null,
    sampleSize: usable.length,
    effectiveSampleSize,
    averageComparability,
    sourceDiversity,
    sellerDiversity,
    externalDemandScore,
    internalSalesScore: internal?.salesScore ?? null,
    internalSalesTrend: internal?.salesTrend ?? null,
    competitionScore,
    observedTrend: null,
    seasonalitySignal: null,
    adjustedTrend: null,
    trendState: 'BASELINE',
    confidence,
    confidenceScore: confidencePoints,
    oldestObservation: usable.length
      ? usable.map((row) => typeof row.rawMetadata?.observedAt === 'string' ? row.rawMetadata.observedAt : '').filter(Boolean).sort()[0] || null
      : null,
    newestObservation: usable.length
      ? usable.map((row) => typeof row.rawMetadata?.observedAt === 'string' ? row.rawMetadata.observedAt : '').filter(Boolean).sort().at(-1) || null
      : null,
  };
}

/**
 * Keeps only directly comparable bundle sizes. Ambiguous sets are excluded;
 * no synthetic per-piece or cross-size price is created.
 * the explicitly named 3er variant. Unknown bundle sizes conservatively
 * count as one item.
 */
export function observationsForVariant(
  observations: ScoredObservation[],
  variant: PortfolioVariant,
) {
  const targetBundle = Math.max(1, Math.round(variant.setSize || 1));
  return observations.filter((row) => row.bundleSize === targetBundle);
}

function relativeChange(before: number | null, after: number | null) {
  if (before == null || after == null || before === 0) return null;
  return (after - before) / Math.abs(before);
}

export function applyTrendHistory(
  current: MarketSnapshotValue,
  history: MarketSnapshotValue[],
  config = MARKET_INTELLIGENCE_CONFIG,
) {
  if (!history.length) return current;
  const previous = history[0];
  const priceChange = relativeChange(previous.medianCents, current.medianCents);
  const demandChange =
    previous.externalDemandScore == null || current.externalDemandScore == null
      ? null
      : current.externalDemandScore - previous.externalDemandScore;
  const observed = clamp((priceChange || 0) * 2 + (demandChange || 0), -1, 1);
  const month = new Date(current.timestamp || Date.now()).getUTCMonth();
  const comparableMonths = history.filter(
    (item) =>
      item.timestamp && new Date(item.timestamp).getUTCMonth() === month,
  );
  const seasonalBaseline = comparableMonths.length
    ? comparableMonths.reduce(
        (sum, item) => sum + (item.adjustedTrend || 0),
        0,
      ) / comparableMonths.length
    : 0;
  const adjusted = clamp(observed - seasonalBaseline * 0.35, -1, 1);
  const direction = Math.sign(adjusted);
  const confirming = history
    .slice(0, config.trendConfirmationPeriods - 1)
    .filter(
      (item) =>
        Math.sign(item.adjustedTrend || 0) === direction &&
        Math.abs(item.adjustedTrend || 0) >= 0.08,
    ).length;
  let trendState: TrendState = 'POSSIBLE_TREND';
  if (Math.abs(adjusted) < 0.08)
    trendState = history.some(
      (item) =>
        item.trendState === 'POSSIBLE_TREND' ||
        item.trendState === 'CONFIRMED_TREND',
    )
      ? 'REJECTED_TREND'
      : 'BASELINE';
  else if (confirming >= config.trendConfirmationPeriods - 1)
    trendState = 'CONFIRMED_TREND';
  return {
    ...current,
    observedTrend: observed,
    seasonalitySignal: seasonalBaseline,
    adjustedTrend: adjusted,
    trendState,
  };
}

export function classifyMarketChange(
  previous: MarketSnapshotValue | null,
  current: MarketSnapshotValue,
  config = MARKET_INTELLIGENCE_CONFIG,
) {
  if (!previous)
    return {
      type: 'NO_CHANGE' as MarketChangeType,
      explanations: ['Erster valider Lauf: Baseline gespeichert.'],
    };
  const medianRate = Math.abs(
    relativeChange(previous.medianCents, current.medianCents) || 0,
  );
  const demandDelta = Math.abs(
    (current.externalDemandScore ?? previous.externalDemandScore ?? 0) -
      (previous.externalDemandScore ?? current.externalDemandScore ?? 0),
  );
  const competitionDelta = Math.abs(
    (current.competitionScore ?? previous.competitionScore ?? 0) -
      (previous.competitionScore ?? current.competitionScore ?? 0),
  );
  const trendDelta = Math.abs(
    (current.adjustedTrend ?? previous.adjustedTrend ?? 0) -
      (previous.adjustedTrend ?? current.adjustedTrend ?? 0),
  );
  const scoreDelta = Math.max(demandDelta, competitionDelta);
  const explanations: string[] = [];
  if (medianRate)
    explanations.push(
      `Marktmedian ${medianRate >= 0 ? 'verändert' : 'stabil'}: ${Math.round(medianRate * 100)} %.`,
    );
  if (demandDelta)
    explanations.push(
      `Nachfragesignal: ${Math.round(demandDelta * 100)} Punkte Veränderung.`,
    );
  if (competitionDelta)
    explanations.push(
      `Konkurrenzsignal: ${Math.round(competitionDelta * 100)} Punkte Veränderung.`,
    );
  if (trendDelta)
    explanations.push(
      `Trend: ${Math.round(trendDelta * 100)} Punkte Veränderung.`,
    );
  const major = config.majorChangeThresholds;
  const relevant = config.relevantChangeThresholds;
  let type: MarketChangeType = 'NO_CHANGE';
  if (
    medianRate >= major.medianRate ||
    scoreDelta >= major.scoreDelta ||
    trendDelta >= major.trendDelta
  )
    type = current.confidence === 'LOW' ? 'RELEVANT_CHANGE' : 'MAJOR_CHANGE';
  else if (
    medianRate >= relevant.medianRate ||
    scoreDelta >= relevant.scoreDelta ||
    trendDelta >= relevant.trendDelta
  )
    type = current.confidence === 'LOW' ? 'MINOR_CHANGE' : 'RELEVANT_CHANGE';
  else if (medianRate >= 0.03 || scoreDelta >= 0.05 || trendDelta >= 0.08)
    type = 'MINOR_CHANGE';
  return { type, explanations };
}

export function researchPriority(input: {
  isNew: boolean;
  confidence?: MarketConfidence | null;
  daysSinceResearch?: number | null;
  lastChange?: MarketChangeType | null;
  possibleTrend?: boolean;
  seasonal?: boolean;
  internalSalesAnomaly?: boolean;
}) {
  let score = input.isNew ? 1 : 0.25;
  if (input.confidence === 'LOW') score += 0.3;
  if ((input.daysSinceResearch || 0) >= 21) score += 0.2;
  if (input.lastChange === 'MAJOR_CHANGE') score += 0.3;
  else if (input.lastChange === 'RELEVANT_CHANGE') score += 0.2;
  if (input.possibleTrend) score += 0.18;
  if (input.seasonal) score += 0.12;
  if (input.internalSalesAnomaly) score += 0.2;
  const priority = clamp(score);
  return {
    priority,
    frequency: input.isNew
      ? 'NEW'
      : priority >= 0.8
        ? 'HOT'
        : input.confidence === 'LOW'
          ? 'LOW_DATA'
          : priority <= 0.3
            ? 'STABLE'
            : 'NORMAL',
  } as const;
}
