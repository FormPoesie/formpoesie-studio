import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTrendHistory,
  calculateMarketSnapshot,
  classifyMarketChange,
  deduplicateAndScore,
  discoverClusters,
  generateResearchQueries,
  type MarketSnapshotValue,
  type PortfolioProduct,
} from '../lib/market-intelligence';

const products: PortfolioProduct[] = [
  {
    id: 'p1',
    name: 'Nachtwächter Büste',
    productType: 'Kunstbüste',
    category: 'Skulptur',
    material: 'PLA',
    physicalOrDigital: 'physical',
    variants: [{ id: 'v1', name: 'Klein', heightMm: 180, setSize: 1 }],
  },
  {
    id: 'p2',
    name: 'Ruhende Büste',
    productType: 'Kunstbüste',
    category: 'Skulptur',
    material: 'PLA',
    physicalOrDigital: 'physical',
    variants: [{ id: 'v2', name: 'Groß', heightMm: 260, setSize: 1 }],
  },
];

void test('clusters and queries are derived from the actual portfolio', () => {
  const clusters = discoverClusters(products);
  const family = clusters.find(
    (cluster) => cluster.dimension === 'product_type',
  );
  assert.equal(family?.label, 'Kunstbüste');
  assert.deepEqual(family?.productIds.sort(), ['p1', 'p2']);
  const queries = generateResearchQueries(family!);
  assert.ok(queries.some((query) => query.query.includes('Kunstbüste')));
});

void test('digital offers never anchor a physical product', async () => {
  const observations = await deduplicateAndScore(products, [
    {
      source: 'example.test',
      sourceUrl: 'https://example.test/download',
      title: 'Nachtwächter Büste STL Download',
      physicalOrDigital: 'digital',
      currency: 'EUR',
      visibleCustomerPriceCents: 500,
      sourceQualityScore: 0.9,
    },
    {
      source: 'shop.test',
      sourceUrl: 'https://shop.test/bueste',
      title: 'Nachtwächter Kunstbüste aus PLA handgemacht',
      material: 'PLA',
      physicalOrDigital: 'physical',
      currency: 'EUR',
      visibleCustomerPriceCents: 4900,
      sourceQualityScore: 0.9,
    },
  ]);
  assert.equal(observations[0].comparabilityScore, 0);
  const snapshot = calculateMarketSnapshot(observations, undefined, {
    ...(await import('../lib/market-intelligence')).MARKET_INTELLIGENCE_CONFIG,
    minComparability: 0.3,
  });
  assert.equal(snapshot.medianCents, 4900);
  assert.equal(snapshot.sampleSize, 1);
});

void test('seller concentration lowers effective sample size', async () => {
  const observations = await deduplicateAndScore(
    products,
    Array.from({ length: 6 }, (_, index) => ({
      source: 'market.test',
      sourceUrl: `https://market.test/item/${index}`,
      title: 'Kunstbüste PLA handgemacht',
      seller: 'Ein Shop',
      material: 'PLA',
      physicalOrDigital: 'physical' as const,
      currency: 'EUR',
      visibleCustomerPriceCents: 4000 + index * 100,
      sourceQualityScore: 0.9,
    })),
  );
  const snapshot = calculateMarketSnapshot(observations, undefined, {
    ...(await import('../lib/market-intelligence')).MARKET_INTELLIGENCE_CONFIG,
    minComparability: 0.3,
  });
  assert.ok(snapshot.effectiveSampleSize < snapshot.sampleSize);
  assert.equal(snapshot.sellerDiversity, 1);
});

void test('first run is baseline and confirmed trend needs repeated history', () => {
  const baseline: MarketSnapshotValue = {
    p25Cents: 3000,
    medianCents: 4000,
    p75Cents: 5000,
    p90Cents: 6000,
    sampleSize: 8,
    effectiveSampleSize: 6,
    averageComparability: 0.8,
    sourceDiversity: 2,
    sellerDiversity: 6,
    externalDemandScore: 0.5,
    internalSalesScore: null,
    internalSalesTrend: null,
    competitionScore: 0.5,
    observedTrend: 0.2,
    seasonalitySignal: 0,
    adjustedTrend: 0.2,
    trendState: 'POSSIBLE_TREND',
    confidence: 'HIGH',
  };
  const current = applyTrendHistory(
    {
      ...baseline,
      medianCents: 4600,
      observedTrend: null,
      adjustedTrend: null,
      trendState: 'BASELINE',
    },
    [baseline, baseline],
  );
  assert.equal(current.trendState, 'CONFIRMED_TREND');
  assert.equal(classifyMarketChange(baseline, current).type, 'RELEVANT_CHANGE');
});
