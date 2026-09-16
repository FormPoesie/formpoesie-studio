import assert from 'node:assert/strict';
import test from 'node:test';
import { researchFieldsChanged } from '../lib/market-analysis-jobs';

const fields = new Set(['name', 'category', 'width_mm']);

void test('erneutes Speichern identischer FINAL-Produktdaten startet keine Analyse', () => {
  assert.equal(
    researchFieldsChanged(
      { name: 'Monstera Clip', category: 'Funktional', width_mm: 40 },
      { name: 'Monstera Clip', width_mm: 40 },
      fields,
    ),
    false,
  );
});

void test('eine tatsächliche research-relevante Änderung startet eine Analyse', () => {
  assert.equal(
    researchFieldsChanged(
      { name: 'Monstera Clip', category: 'Funktional', width_mm: 40 },
      { width_mm: 45 },
      fields,
    ),
    true,
  );
});

void test('Preisfelder sind keine Research-Trigger', () => {
  assert.equal(
    researchFieldsChanged(
      { name: 'Monstera Clip' },
      { default_price_cents: 390 },
      fields,
    ),
    false,
  );
});
