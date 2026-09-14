import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceCustomerIsComplete,
  shippingMethodForChannel,
} from '../lib/invoice-workflow';

void test('maps pickup and leaves the carrier open for shipped orders', () => {
  assert.equal(shippingMethodForChannel('Abholung'), 'abholung');
  assert.equal(shippingMethodForChannel('Etsy'), null);
  assert.equal(shippingMethodForChannel('Vinted'), null);
});

void test('requires name and billing address for an invoice', () => {
  assert.equal(
    invoiceCustomerIsComplete('Marlon Stiller', 'Musterstraße 1'),
    true,
  );
  assert.equal(invoiceCustomerIsComplete('Marlon Stiller', '   '), false);
  assert.equal(invoiceCustomerIsComplete('', 'Musterstraße 1'), false);
});
