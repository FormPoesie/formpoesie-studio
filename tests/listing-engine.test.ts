import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePricing,
  createImagePlan,
  createLocaleContent,
  imageMetadata,
  type ProductInput,
} from '../lib/listing-engine';
import {
  canManageInventory,
  normalizeInventoryProduct,
} from '../lib/inventory-bridge';

const base: ProductInput = {
  modelName: 'Fragment',
  productType: 'Kopfskulptur',
  buyerWorld: 'Kunst & Skulptur',
  material: 'PLA',
  widthMm: 120,
  heightMm: 180,
  depthMm: 95,
  designOrigin: 'bestätigt',
  kind: 'sculpture',
  variant: {
    name: 'Standard',
    setSize: 1,
    weightGrams: 280,
    printHours: 14,
    activeMinutes: 25,
    failureRate: 0.08,
  },
  costs: {
    materialPerKg: 24.9,
    machinePerHour: 0.8,
    electricityPerHour: 0.12,
    electricityIncluded: true,
    laborPerHour: 22,
    packaging: 1.2,
    overhead: 1,
    postage: 5.49,
    buyerShipping: 0,
    targetMargin: 0.3,
  },
  research: [],
};

void test('eine einfache Skulptur erhält genau fünf verbindliche Rollen', () => {
  assert.deepEqual(
    createImagePlan(base, 3).map((item) => item.role),
    ['Hero', 'Seite', 'Größe & Maße', 'Detail', 'Lifestyle'],
  );
});

void test('ein Foto erfindet keine zusätzliche Seitenansicht', () => {
  const plan = createImagePlan(base, 1);
  assert.equal(
    plan.find((item) => item.role === 'Seite')?.status,
    'needs_photo',
  );
  assert.equal(
    plan.some((item) => item.role === 'Rückseite'),
    false,
  );
});

void test('funktionale Kunst zeigt Anwendung an zweiter Stelle', () => {
  const plan = createImagePlan({ ...base, kind: 'functional' }, 3);
  assert.equal(plan[1].role, 'Anwendung');
});

void test('alle Etsy-Titel und Tags bleiben innerhalb der technischen Grenzen', () => {
  for (const locale of ['de', 'en'] as const) {
    const content = createLocaleContent(base, locale);
    assert.ok(content.titles.every((title) => title.length <= 140));
    assert.ok(content.tags.every((tag) => tag.length <= 20));
    assert.ok(content.tags.length <= 13);
  }
});

void test('Dateiendung entspricht dem JPEG-Exportformat', () => {
  const metadata = imageMetadata(base, createImagePlan(base, 3));
  assert.ok(metadata.every((item) => item.filename.endsWith('.jpg')));
});

void test('gerundeter Etsy-Preis unterschreitet die errechnete Untergrenze nicht', () => {
  const result = calculatePricing(base);
  assert.ok(result.etsyPrice >= result.floorPrice);
  assert.ok(result.resultWithoutAds > 0);
  assert.ok(result.resultWithAds < result.resultWithoutAds);
});

void test('Strom wird bei enthaltenem Maschinenpreis nicht doppelt gezählt', () => {
  const included = calculatePricing(base);
  const separate = calculatePricing({
    ...base,
    costs: { ...base.costs, electricityIncluded: false },
  });
  assert.equal(included.breakdown.electricity, 0);
  assert.ok(separate.breakdown.electricity > 0);
  assert.ok(separate.floorPrice > included.floorPrice);
});

void test('übernommene Inventarkosten ersetzen eine zweite Produktionsschätzung', () => {
  const result = calculatePricing({
    ...base,
    costs: { ...base.costs, recordedProductionCost: 4.2 },
  });
  assert.equal(result.breakdown.inventoryProduction, 4.2);
  assert.equal(result.breakdown.material, 0);
  assert.match(result.assumptions.join(' '), /Inventar/);
});

void test('Inventarartikel werden mit Produktionsdaten normalisiert, ohne Maßachsen zu erfinden', () => {
  const item = normalizeInventoryProduct({
    id: 12,
    name: 'Apollo Vase',
    category: 'Antike',
    size: '11,3x6,4x15cm',
    print_minutes: 282,
    production_cost_cents: 162,
    filaments: [{ grams: 163, material: { name: 'PLA Marmor' } }],
    variants: [],
  });
  assert.equal(item.printHours, 4.7);
  assert.equal(item.productionCost, 1.62);
  assert.equal(item.weightGrams, 163);
  assert.equal(item.widthMm, null);
  assert.equal(item.size, '11,3x6,4x15cm');
});

void test('Verwaltung ist nur für Jasmin und Marlon freigegeben', () => {
  assert.equal(
    canManageInventory(null, { name: 'Marlon', role: 'inhaber' }),
    true,
  );
  assert.equal(
    canManageInventory(
      { email: 'jasmin@formpoesie.de' },
      { name: 'Jasmin', role: 'admin' },
    ),
    true,
  );
  assert.equal(
    canManageInventory(
      { email: 'jonas@formpoesie.de' },
      { name: 'Jonas', role: 'mitarbeiter' },
    ),
    false,
  );
  assert.equal(
    canManageInventory(
      { email: 'jonas@formpoesie.de' },
      { name: 'Marlon', role: 'mitarbeiter' },
    ),
    false,
  );
});
