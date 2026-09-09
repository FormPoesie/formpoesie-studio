import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceCustomerIsComplete,
  shippingMethodForChannel,
} from '../lib/invoice-workflow';

void test('maps sales channels to the lowercase shipping values accepted by online_sales', () => {
  assert.equal(shippingMethodForChannel('Abholung'), 'abholung');
  assert.equal(shippingMethodForChannel('Etsy'), 'versand');
});

void test('requires name and billing address for an invoice', () => {
  assert.equal(
    invoiceCustomerIsComplete('Marlon Stiller', 'Musterstraße 1'),
    true,
  );
  assert.equal(invoiceCustomerIsComplete('Marlon Stiller', '   '), false);
  assert.equal(invoiceCustomerIsComplete('', 'Musterstraße 1'), false);
});
