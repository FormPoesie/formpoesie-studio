import assert from 'node:assert/strict';
import test from 'node:test';
import {
  electricityCostCents,
  filamentCostCents,
  machineCostCents,
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
