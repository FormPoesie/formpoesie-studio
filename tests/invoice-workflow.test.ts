import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceCustomerIsComplete,
  shippingMethodForChannel,
} from '../lib/invoice-workflow';

void test('keeps pickup explicit and leaves an unknown carrier unset', () => {
  assert.equal(shippingMethodForChannel('Abholung'), 'abholung');
  assert.equal(shippingMethodForChannel('Etsy'), null);
});

void test('requires name and billing address for an invoice', () => {
  assert.equal(
    invoiceCustomerIsComplete('Marlon Stiller', 'Musterstraße 1'),
    true,
  );
  assert.equal(invoiceCustomerIsComplete('Marlon Stiller', '   '), false);
  assert.equal(invoiceCustomerIsComplete('', 'Musterstraße 1'), false);
});
