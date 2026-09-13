import assert from 'node:assert/strict';
import test from 'node:test';
import {
  electricityCostCents,
  filamentCostCents,
  isDigitalInventoryProduct,
  machineCostCents,
  variantProductionIssues,
  variantCostBreakdown,
} from '../lib/inventory-production';

void test('übernimmt die Inventarformeln für Maschine, Strom und Filament centgenau', () => {
  assert.equal(machineCostCents(600), 100);
  assert.equal(electricityCostCents('X2D', 600), 90);
  assert.equal(electricityCostCents('A1 Mini', 600), 30);
  assert.equal(filamentCostCents(250, 1999, 1000), 500);
});

void test('trennt Netto, Ausschuss und nimmt je Bauteil-Slot nur die teuerste Alternative', () => {
  const material = {
    id: 1,
    pricePerRollCents: 2000,
    spoolWeightGrams: 1000,
  };
  const componentProducts = [
    { id: 10, productionCostCents: 100, variants: [] },
    { id: 11, productionCostCents: 160, variants: [] },
  ];
  const result = variantCostBreakdown(
    { id: 1, filaments: [], variants: [] },
    {
      id: 2,
      material,
      grams: 100,
      wasteGrams: 10,
      printMinutes: 60,
      printer: 'X2D',
      extraCostCents: 25,
      priceCents: 1000,
    },
    componentProducts,
    [
      {
        parentProductId: 1,
        parentVariantId: 2,
        componentProductId: 10,
        quantity: 1,
        slot: 'Topf',
      },
      {
        parentProductId: 1,
        parentVariantId: 2,
        componentProductId: 11,
        quantity: 1,
        slot: 'Topf',
      },
    ],
  );
  assert.equal(result.filamentCents, 200);
  assert.equal(result.wasteCents, 20);
  assert.equal(result.machineCents, 10);
  assert.equal(result.electricityCents, 9);
  assert.equal(result.componentsCents, 160);
  assert.equal(result.totalCents, 424);
  assert.equal(result.marginCents, 576);
  assert.ok(Math.abs((result.marginPercent || 0) - 57.6) < 0.001);
});

void test('zeigt bei fehlendem Filament keine erfundene Marge', () => {
  const result = variantCostBreakdown(
    { id: 1, category: 'Pflanzen-Sets', filaments: [] },
    {
      id: 2,
      grams: 181,
      printMinutes: 391,
      printer: 'X2D',
      priceCents: 2500,
    },
  );
  assert.equal(result.filamentCents, 0);
  assert.equal(result.marginPercent, null);
});

void test('digitale STL-Varianten sind unbegrenzt und haben keine Stückkosten', () => {
  const product = {
    id: 1,
    name: 'Meditierendes Huhn STL & 3MF',
    category: 'STL Datei',
    filaments: [],
  };
  const result = variantCostBreakdown(product, {
    id: 2,
    grams: 250,
    printMinutes: 600,
    printer: 'X2D',
    extraCostCents: 100,
    priceCents: 490,
  });
  assert.equal(isDigitalInventoryProduct(product), true);
  assert.deepEqual(variantProductionIssues(product, { priceCents: 490 }), []);
  assert.equal(result.totalCents, 0);
  assert.equal(result.marginCents, 490);
  assert.equal(result.marginPercent, 100);
  assert.equal(result.netGrams, 0);
  assert.equal(result.printMinutes, 0);
});

void test('rechnet mehrere Farben innerhalb derselben Variante zusammen', () => {
  const material = {
    id: 1,
    pricePerRollCents: 2000,
    spoolWeightGrams: 1000,
  };
  const secondMaterial = {
    id: 2,
    pricePerRollCents: 3000,
    spoolWeightGrams: 1000,
  };
  const result = variantCostBreakdown(
    {
      id: 1,
      filaments: [
        {
          id: 9,
          productVariantId: 2,
          part: '',
          material: secondMaterial,
          grams: 28.53,
          wasteGrams: 1.47,
        },
      ],
    },
    {
      id: 2,
      material,
      grams: 200,
      wasteGrams: 10,
      printMinutes: 60,
      printer: 'X2D',
      priceCents: 1500,
    },
  );
  assert.equal(result.netGrams, 228.53);
  assert.equal(result.wasteGrams, 11.47);
  assert.equal(result.filamentCents, 486);
  assert.equal(result.wasteCents, 24);
});
