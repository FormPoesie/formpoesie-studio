import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPENDENCIES,
  buildImageChatTask,
  classifyHoliday,
  generateDescription,
  generateKeywords,
  imageSlotTransition,
  snapshotProduct,
  suggestImagePlan,
} from '../lib/etsy-workflow';
import { calculateAutomaticEtsyPrice } from '../lib/central-pricing';
import { calculatePhysicalRecommendation } from '../lib/pricing-engine';
import type { InventoryItem } from '../lib/inventory-bridge';

const item: InventoryItem = {
  id: 'inventory-1',
  modelName: 'Nachtwächter',
  productType: 'Gothic Figur',
  sku: 'wird-nicht-übernommen',
  material: 'wird-nicht-übernommen',
  size: '',
  widthMm: 80,
  depthMm: 70,
  heightMm: 160,
  weightGrams: 120,
  printHours: 4,
  productionCost: 3,
  currentPrice: 15,
  stockQuantity: 5,
  complete: true,
  category: 'Gothic Figur',
  imagePath: '',
  designOrigin: '',
  buyerWorld: 'Dark & Gothic',
  updatedAt: '2026-09-09T00:00:00Z',
  variants: [
    {
      id: 's',
      name: 'Klein',
      sku: 'S',
      material: 'PLA',
      size: '8 × 7 × 16 cm',
      color: 'Schwarz',
      setSize: 1,
      weightGrams: 120,
      printHours: 4,
      productionCost: 3,
      currentPrice: 15,
    },
    {
      id: 'l',
      name: 'Groß',
      sku: 'L',
      material: 'PLA',
      size: '12 × 10 × 24 cm',
      color: 'Rot',
      setSize: 1,
      weightGrams: 260,
      printHours: 8,
      productionCost: 6,
      currentPrice: 25,
    },
  ],
};

void test('Workflow-Snapshot übernimmt alle Varianten, aber keine SKU-, Material- oder Farbdaten', () => {
  const snapshot = snapshotProduct(item);
  assert.equal(snapshot.variants.length, 2);
  assert.deepEqual(
    snapshot.variants.map((variant) => variant.id),
    ['s', 'l'],
  );
  assert.equal('sku' in snapshot, false);
  assert.equal('material' in snapshot.variants[0], false);
  assert.equal('color' in snapshot.variants[0], false);
});

void test('Keyword-Schritt liefert genau 13 technisch begrenzte Tags', () => {
  const result = generateKeywords(snapshotProduct(item));
  assert.equal(result.tags.length, 13);
  assert.ok(result.tags.every((tag) => tag.length <= 20));
  assert.ok(result.candidates.every((candidate) => candidate.score >= 0));
  assert.ok(!result.tags.includes('kunst'));
  assert.ok(!result.tags.includes('deko'));
});

void test('Bildaufgabe trennt Produkt- und Hintergrundreferenz und fordert exakt ein Einzelbild', () => {
  const product = snapshotProduct(item);
  const slot = suggestImagePlan(product)[0];
  const prompt = buildImageChatTask({
    product,
    slot: { id: 'slot-1', ...slot },
    productReferences: [
      { id: 'front', filename: 'front.jpg', url: 'https://example.test/front' },
      { id: 'back', filename: 'back.jpg', url: 'https://example.test/back' },
    ],
    backgroundReference: {
      id: 'scene',
      filename: 'scene.jpg',
      url: 'https://example.test/scene',
    },
  });
  assert.match(prompt, /genau EIN einzelnes Etsy-Produktfoto/);
  assert.match(prompt, /Keine Collage/);
  assert.match(prompt, /ausschließlich diese Bilder definieren Produktform/);
  assert.match(prompt, /nur Stil\/Hintergrund, niemals Produktquelle/);
});

void test('Bildslot folgt DRAFT → GENERATED → IMPORTED → APPROVED und lässt andere Freigaben unverändert', () => {
  const slots = { first: 'DRAFT', second: 'DRAFT' };
  slots.first = imageSlotTransition('create-task');
  assert.equal(slots.first, 'GENERATED');
  slots.first = imageSlotTransition('import');
  assert.equal(slots.first, 'IMPORTED');
  slots.first = imageSlotTransition('approve');
  assert.equal(slots.first, 'APPROVED');
  slots.second = imageSlotTransition('create-task');
  assert.equal(slots.first, 'APPROVED');
  assert.equal(slots.second, 'GENERATED');
});

void test('Etsy-Workflow und zentraler Preiskalkulator verwenden dasselbe Engine-Ergebnis', () => {
  const product = snapshotProduct(item);
  const calculated = calculateAutomaticEtsyPrice(product, product.variants[0]);
  assert.ok(calculated);
  const direct = calculatePhysicalRecommendation(calculated!.input);
  assert.equal(calculated!.result.recommendedPrice, direct.recommendedPrice);
  assert.equal(product.variants[0].currentPrice, 15);
});

void test('Preisänderungen markieren die Beschreibung als abhängig', () => {
  assert.deepEqual(DEPENDENCIES.VARIANT_PRICING, ['DESCRIPTION']);
});

void test('Beschreibung führt jede Inventarvariante mit ihrem Preis', () => {
  const result = generateDescription(snapshotProduct(item), 'Gothic Figur', {
    s: 1990,
    l: 2990,
  });
  assert.match(result.description_de, /Klein/);
  assert.match(result.description_de, /Groß/);
  assert.match(result.description_de, /19,90/);
  assert.match(result.description_en, /29\.90/);
});

void test('Gothic bleibt ganzjährig und wird nur als Halloween-relevant eingestuft', () => {
  const result = classifyHoliday(snapshotProduct(item));
  assert.equal(result.classification, 'HOLIDAY_RELEVANT');
  assert.equal(result.recommended_holiday, 'Halloween');
});
