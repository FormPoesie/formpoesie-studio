import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryReviewStatus } from '../lib/inventory-bridge';

void test('fehlende Status-Metadaten bleiben Entwurf und werden nie implizit final', () => {
  assert.equal(inventoryReviewStatus(undefined), 'draft');
  assert.equal(inventoryReviewStatus(null), 'draft');
  assert.equal(inventoryReviewStatus(''), 'draft');
  assert.equal(inventoryReviewStatus('unbekannt'), 'draft');
});

void test('nur ausdrücklich gespeichertes final gilt als final', () => {
  assert.equal(inventoryReviewStatus('final'), 'final');
  assert.equal(inventoryReviewStatus('FINAL'), 'final');
  assert.equal(inventoryReviewStatus('draft'), 'draft');
  assert.equal(inventoryReviewStatus('Final bearbeitet'), 'draft');
  assert.equal(inventoryReviewStatus(true), 'draft');
});

void test('Kundenaufträge erhalten einen eigenen, ausdrücklich gespeicherten Status', () => {
  assert.equal(inventoryReviewStatus('customer_order'), 'customer_order');
  assert.equal(inventoryReviewStatus('CUSTOMER_ORDER'), 'customer_order');
  assert.equal(inventoryReviewStatus('Kundenauftrag'), 'draft');
});
