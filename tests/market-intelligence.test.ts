import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTrendHistory,
  calculateMarketSnapshot,
  classifyMarketChange,
  deduplicateAndScore,
  discoverClusters,
  generateResearchQueries,
  observationsForVariant,
  scoreComparability,
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

void test('German ghost tealight sets match equivalent English listings', () => {
  const product: PortfolioProduct = {
    id: 'ghosts',
    name: '3er Geister Trio Teelichthalter',
    productType: 'Teelichthalter',
    category: 'Halloween',
    physicalOrDigital: 'physical',
    variants: [{ id: 'ghost-trio', name: '3er Set', setSize: 3 }],
  };
  const score = scoreComparability(product, {
    source: 'etsy.test',
    sourceUrl: 'https://etsy.test/ghosts',
    title: '3D Printed Ghost Tealight Holder Set of 3 Halloween Decor',
    physicalOrDigital: 'physical',
    bundleSize: 3,
    currency: 'EUR',
    visibleCustomerPriceCents: 2990,
    sourceQualityScore: 0.9,
  });
  assert.ok(score >= 0.56, `expected comparable score, got ${score}`);

  const cluster = discoverClusters([product]).find((item) => item.dimension === 'product');
  const queries = generateResearchQueries(cluster!);
  assert.ok(queries.some((query) => query.query.includes('ghost')));
  assert.ok(queries.some((query) => query.query.includes('3D printed')));
});

void test('ein physisch 3D-gedruckter deutscher Geist-Teelichthalter besteht die Kernprüfung', () => {
  const product: PortfolioProduct = {
    id: 'ghosts', name: '3er Geister Trio Teelichthalter',
    productType: 'Halloween', category: 'Halloween', physicalOrDigital: 'physical',
    variants: [{ id: 'small', name: 'Klein', setSize: 1 }],
  };
  const score = scoreComparability(product, {
    source: 'etsy.test', sourceUrl: 'https://etsy.test/floating-flame',
    title: 'Floating Flame Ghost Teelichthalter - 3D Gedruckt',
    physicalOrDigital: 'physical', currency: 'EUR', visibleCustomerPriceCents: 869,
    sourceQualityScore: 0.68,
  });
  assert.ok(score >= 0.5, `expected core match, got ${score}`);
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

void test('Setpreise werden nicht künstlich auf Einzelvarianten umgerechnet', async () => {
  const observations = await deduplicateAndScore(products, [{
    source: 'etsy.test', sourceUrl: 'https://etsy.test/ghost-trio',
    title: '3D Printed Ghost Trio Set of 3', physicalOrDigital: 'physical',
    currency: 'EUR', visibleCustomerPriceCents: 1500, bundleSize: 3,
    sourceQualityScore: 0.9,
  }]);
  const single = observationsForVariant(observations, { id: 'small', name: 'Klein', setSize: 1 });
  const trio = observationsForVariant(observations, { id: 'trio', name: '3er Set', setSize: 3 });
  assert.equal(single.length, 0);
  assert.equal(trio[0].visibleCustomerPriceCents, 1500);
});

void test('Einzelgrößen erfinden ohne beobachtete Varianten keine Preisstaffel', async () => {
  const observations = await deduplicateAndScore(products, [{
    source: 'etsy.test', sourceUrl: 'https://etsy.test/printed-ghost',
    title: '3D Printed Ghost Tealight Holder PLA', material: 'PLA',
    physicalOrDigital: 'physical', currency: 'EUR', visibleCustomerPriceCents: 1000,
    bundleSize: 1, sourceQualityScore: 0.9,
  }]);
  const variants = [
    { id: 'small', name: 'Klein', widthMm: 60, heightMm: 70, depthMm: 60, setSize: 1 },
    { id: 'medium', name: 'Mittel', widthMm: 75, heightMm: 85, depthMm: 75, setSize: 1 },
    { id: 'large', name: 'Groß', widthMm: 90, heightMm: 100, depthMm: 90, setSize: 1 },
  ];
  const prices = variants.map((variant) =>
    observationsForVariant(observations, variant)[0].visibleCustomerPriceCents,
  );
  assert.deepEqual(prices, [1000, 1000, 1000]);
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
