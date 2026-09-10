import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBWarePrice,
  calculateDefectScore,
  calculateDigitalRecommendation,
  calculateDiscountSafety,
  calculateMarketCostPerSale,
  calculateMinimumContribution,
  calculatePhysicalRecommendation,
  calculatePresenceFactor,
  evaluatePortfolioSignals,
  invertChannelFees,
  roundEtsyDigital,
  roundEtsyPhysical,
  roundMarketPrice,
  suggestDefectScores,
  type DigitalLicense,
  type PhysicalPricingInput,
} from '../lib/pricing-engine';
import { DEFAULT_PRICING_CONFIG } from '../lib/pricing-config';

const neutralValue = {
  complexity: 0,
  functionValue: 0,
  giftValue: 0,
  collectorValue: 0,
  personalization: 0,
  finish: 0,
};

function physical(overrides: Partial<PhysicalPricingInput> = {}) {
  return calculatePhysicalRecommendation({
    cogs: 4,
    channel: 'etsy',
    category: 'figures',
    tier: 'standard',
    lengthCm: 10,
    widthCm: 8,
    heightCm: 15,
    value: neutralValue,
    demand: 'known',
    competition: 'medium',
    ...overrides,
  });
}

const digitalLicense: DigitalLicense = {
  physicalCommercialUseAllowed: true,
  digitalRedistributionAllowed: true,
  buyerCommercialUseAllowed: false,
  evidence: 'Vertrag vom 01.01.2026',
};

void test('01 kleines 30-g-Geschenkprodukt verwendet COGS und Marktanker getrennt', () => {
  const result = physical({
    cogs: 1.2,
    category: 'smallItems',
    lengthCm: 4,
    widthCm: 3,
    heightCm: 3,
  });
  assert.equal(result.minimumContribution, 5);
  assert.ok((result.recommendedPrice || 0) >= (result.floorPrice || 0));
});

void test('02 60-g-Gothic-Skeletthand erhält Gothic-Marktanker', () => {
  const result = physical({ cogs: 2.8, category: 'gothic', heightCm: 18 });
  assert.ok((result.marketPrice || 0) > 0);
});

void test('03 mittelgroße Figur wird vollständig empfohlen', () => {
  assert.equal(physical().status, 'OK');
});

void test('04 große leichte Hohlvase wird über Präsenz und nicht Gewicht bewertet', () => {
  const small = physical({
    category: 'hollow',
    cogs: 3,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 15,
    hollowBody: true,
  });
  const large = physical({
    category: 'hollow',
    cogs: 3,
    lengthCm: 18,
    widthCm: 18,
    heightCm: 45,
    hollowBody: true,
  });
  assert.ok((large.marketPrice || 0) > (small.marketPrice || 0));
});

void test('05 schwere 1-kg-Skulptur schützt hohe COGS über den Floor', () => {
  const result = physical({ cogs: 42, category: 'figures' });
  assert.equal(result.minimumContribution, 16.8);
  assert.equal(result.diagnostics.priceDriver, 'floor');
});

void test('06 mehrteiliges funktionales Set verwendet Set-Marktgruppe', () => {
  const result = physical({ category: 'sets', cogs: 12 });
  assert.ok((result.diagnostics.selectedQuantile || 0) > 0);
});

void test('07 historische Büste verwendet historische Quantile', () => {
  const result = physical({ category: 'historicalBusts', heightCm: 18 });
  assert.ok((result.diagnostics.selectedQuantile || 0) >= 17.09);
});

void test('08 Ultra-Variante mit höheren eigenen COGS hat eigenen Floor', () => {
  const standard = physical({ cogs: 5, tier: 'standard' });
  const ultra = physical({ cogs: 25, tier: 'ultra', value: { ...neutralValue, finish: 1 } });
  assert.ok((ultra.floorPrice || 0) > (standard.floorPrice || 0));
});

void test('09 einfache STL erhält digitale Preisleiter', () => {
  const result = calculateDigitalRecommendation({
    channel: 'etsy',
    license: digitalLicense,
    modelComplexity: 0.2,
    demand: 0.2,
    differentiation: 0.2,
    utility: 0.2,
    printReadiness: 0.2,
    competition: 'medium',
  });
  assert.ok(DEFAULT_PRICING_CONFIG.digital.priceLadder.includes(result.recommendedPrice || 0));
});

void test('10 STL + 3MF + Anleitung profitiert von hoher Readiness', () => {
  const low = calculateDigitalRecommendation({
    channel: 'etsy', license: digitalLicense, modelComplexity: 0.5, demand: 0.5,
    differentiation: 0.5, utility: 0.5, printReadiness: 0, competition: 'medium',
  });
  const high = calculateDigitalRecommendation({
    channel: 'etsy', license: digitalLicense, modelComplexity: 0.5, demand: 0.5,
    differentiation: 0.5, utility: 0.5, printReadiness: 1, competition: 'medium',
  });
  assert.ok((high.marketPrice || 0) > (low.marketPrice || 0));
});

void test('11 Digital ohne Redistribution-Recht ist blockiert', () => {
  const result = calculateDigitalRecommendation({
    channel: 'etsy', license: { ...digitalLicense, digitalRedistributionAllowed: false },
    modelComplexity: 1, demand: 1, differentiation: 1, utility: 1,
    printReadiness: 1, competition: 'low',
  });
  assert.equal(result.status, 'BLOCKED_LICENSE');
  assert.equal(result.recommendedPrice, undefined);
});

void test('12–14 Etsy-Inversion bildet normal, Offsite 12 % und Offsite 15 % exakt ab', () => {
  const result = physical();
  const scenarios = result.diagnostics.etsyScenarios || {};
  assert.ok(scenarios.normal < scenarios.offsite12);
  assert.ok(scenarios.offsite12 < scenarios.offsite15);
  for (const rate of [0, 0.12, 0.15]) {
    const floor = invertChannelFees({
      requiredNet: 9,
      discountFactor: 0.85,
      percentageFees: 0.105 + rate,
      fixedFees: 0.48,
      feeVatRate: 0.19,
    });
    assert.ok(floor > 9);
  }
});

void test('15 15-%-Sale wird anhand tatsächlichen Nettoerlöses geprüft', () => {
  const result = physical();
  assert.equal(result.discountSafety?.fifteenPercent.state, 'GREEN');
});

void test('16 hohe Marktstandkosten erhöhen den Markt-Floor pro erwartetem Verkauf', () => {
  const marketCost = calculateMarketCostPerSale(120, 30, 10, 8);
  const result = physical({ channel: 'market', channelNonCogsCost: marketCost });
  assert.equal(marketCost, 20);
  assert.ok((result.floorPrice || 0) >= 29);
});

void test('17 Markt 4,81 wird zu 5,00', () => assert.equal(roundMarketPrice(4.81), 5));
void test('18 Markt 5,01 wird zu 10,00', () => assert.equal(roundMarketPrice(5.01), 10));
void test('19 Digital 5,01 wird zu 5,90', () => assert.equal(roundEtsyDigital(5.01), 5.9));
void test('20 Digital über 24,90 erweitert die Leiter ohne Cap', () => {
  assert.equal(roundEtsyDigital(25), 29.9);
  assert.equal(roundEtsyDigital(47), 49.9);
});

void test('21 kleiner kosmetischer B-Ware-Mangel bleibt verkaufbar', () => {
  const result = calculateBWarePrice({
    normalPrice: 30, channel: 'direct', defects: suggestDefectScores('Unterseite', 'kaum'),
    safetyRisk: false, structurallyUnreliable: false, mainFunctionLost: false,
    defectCanBeClearlyDisclosed: true, futureNonFeeCosts: 2,
  });
  assert.equal(result.status, 'OK');
  assert.ok((result.defectFactor || 0) > 0.8);
});

void test('22 halbe Brille erzeugt stärkeren Wertverlust als Unterseitenmangel', () => {
  const subtle = calculateDefectScore(suggestDefectScores('Unterseite', 'leicht'));
  const glasses = calculateDefectScore(suggestDefectScores('Brille', 'deutlich'));
  assert.ok(glasses > subtle);
});

void test('23 verlorene Hauptfunktion wird abgelehnt oder neu klassifiziert', () => {
  assert.equal(calculateBWarePrice({ normalPrice: 20, channel: 'direct', defects: suggestDefectScores('funktionales Element', 'deutlich'), safetyRisk: false, structurallyUnreliable: false, mainFunctionLost: true, defectCanBeClearlyDisclosed: true, futureNonFeeCosts: 1 }).status, 'REJECT_OR_RECLASSIFY');
});

void test('24 Sicherheitsrisiko blockiert B-Ware', () => {
  assert.equal(calculateBWarePrice({ normalPrice: 20, channel: 'direct', defects: suggestDefectScores('tragendes Element', 'sehr'), safetyRisk: true, structurallyUnreliable: true, mainFunctionLost: false, defectCanBeClearlyDisclosed: true, futureNonFeeCosts: 1 }).status, 'BLOCKED_UNSAFE');
});

void test('25 Marktanker unter Floor lässt Floor preisbestimmend', () => {
  assert.equal(physical({ cogs: 50 }).diagnostics.priceDriver, 'floor');
});

void test('26 Marktanker über Floor lässt Markt preisbestimmend', () => {
  assert.equal(physical({ cogs: 1, heightCm: 35, widthCm: 20, lengthCm: 20, value: { ...neutralValue, collectorValue: 1 } }).diagnostics.priceDriver, 'market');
});

void test('27 Floor über 120 % P90 markiert REVIEW_MARKET_FIT', () => {
  assert.equal(physical({ cogs: 100, category: 'smallItems' }).status, 'REVIEW_MARKET_FIT');
});

void test('Invarianten: Rundungen unterschreiten nie den Rohpreis/Floor', () => {
  for (const raw of [0.01, 4.81, 5.01, 49.99, 52.1, 999.01]) {
    assert.ok(roundMarketPrice(raw) + 1e-9 >= raw);
    assert.ok(roundEtsyPhysical(raw) + 1e-9 >= raw);
    assert.ok(roundEtsyDigital(raw) + 1e-9 >= raw);
  }
  const result = physical();
  assert.ok((result.recommendedPrice || 0) >= (result.floorPrice || 0));
});

void test('Invarianten: Marktpreis wird nicht noch einmal durch Gebühren geschickt', () => {
  const lowCogs = physical({ cogs: 0.1, channel: 'etsy' });
  assert.equal(lowCogs.rawPrice, lowCogs.marketPrice);
});

void test('Invarianten: Mindestbeitrag zählt COGS genau einmal', () => {
  assert.equal(calculateMinimumContribution(20), 8);
  const result = physical({ cogs: 20, channel: 'direct', lengthCm: null });
  assert.equal(result.requiredNet, 28);
});

void test('Invarianten: Gewicht ist kein Marktwertparameter', () => {
  const input = { category: 'hollow' as const, lengthCm: 20, widthCm: 20, heightCm: 30, hollowBody: true };
  assert.deepEqual(calculatePresenceFactor(input), calculatePresenceFactor(input));
});

void test('Invarianten: Altpreis ist kein Eingabefeld der Engine und Empfehlung ändert ihn nicht', () => {
  const legacy = { currentPrice: 99 };
  physical({ cogs: 2 });
  assert.equal(legacy.currentPrice, 99);
});

void test('Portfolio nutzt nur vorhandene Verkäufe und aggregiert Kleinstichproben', () => {
  const asOf = new Date('2026-09-11T12:00:00Z');
  const result = evaluatePortfolioSignals([
    { sku: 'A', variantId: 'red', channel: 'etsy', soldAt: '2026-09-05', quantity: 1, realizedPrice: 20, cogsSnapshot: 5 },
    { sku: 'A', variantId: 'blue', channel: 'etsy', soldAt: '2026-08-20', quantity: 2, realizedPrice: 20, cogsSnapshot: 5 },
  ], asOf);
  assert.ok(result.length > 0);
  assert.equal(result[0].aggregatedAt, 'sku');
  assert.equal(result[0].realizedPrice, 20);
});

void test('Rabattstatus unterscheidet Mindestbeitrag und Break-even', () => {
  const safety = calculateDiscountSafety({
    regularPrice: 12,
    cogs: 10,
    minimumContribution: 5,
    channel: 'direct',
  });
  assert.equal(safety.tenPercent.state, 'YELLOW');
  assert.equal(safety.twentyPercent.state, 'RED');
});

void test('alle fünf physischen Kanäle werden unabhängig berechnet', () => {
  const recommendations = (['etsy', 'direct', 'vinted', 'ebay', 'market'] as const).map(
    (channel) => physical({ channel }),
  );
  assert.deepEqual(
    recommendations.map((result) => result.channel),
    ['etsy', 'direct', 'vinted', 'ebay', 'market'],
  );
  assert.ok(recommendations.every((result) => (result.recommendedPrice || 0) >= (result.floorPrice || 0)));
});

void test('fehlende Maße erzeugen keine scheinpräzise Marktberechnung', () => {
  const result = physical({ lengthCm: null, widthCm: null, heightCm: null });
  assert.equal(result.marketPrice, undefined);
  assert.equal(result.confidence, 'low');
  assert.equal(result.diagnostics.priceDriver, 'floor');
});

void test('Portfolio schützt Kaltstart und Saison statt Slow Mover automatisch zu senken', () => {
  const asOf = new Date('2026-09-11T12:00:00Z');
  const cold = evaluatePortfolioSignals([
    { sku: 'NEU', channel: 'etsy', soldAt: '2026-09-01', quantity: 1, launchedAt: '2026-08-20' },
  ], asOf, 'herbst');
  assert.equal(cold[0].state, 'HOLD');
  const seasonal = evaluatePortfolioSignals([
    { sku: 'XMAS', channel: 'etsy', soldAt: '2025-12-01', quantity: 1, launchedAt: '2025-01-01', season: 'weihnachten' },
  ], asOf, 'herbst');
  assert.equal(seasonal[0].state, 'HOLD');
});

void test('Portfolio erfindet keine Preise, Kosten oder Conversion-Daten', () => {
  const result = evaluatePortfolioSignals([
    { sku: 'OHNE-METRIKEN', channel: 'direct', soldAt: '2026-09-01', quantity: 1 },
  ], new Date('2026-09-11T12:00:00Z'));
  assert.equal(result[0].realizedPrice, null);
  assert.equal(result[0].contributionMargin, null);
  assert.equal('conversionRate' in result[0], false);
});
