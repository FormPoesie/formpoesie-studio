import assert from 'node:assert/strict';
import test from 'node:test';
import { centsToEuroInput, euroInputToCents } from '../lib/euro-input';

test('formatiert Cent als deutsches Euro-Eingabefeld', () => {
  assert.equal(centsToEuroInput(1250), '12,50');
  assert.equal(centsToEuroInput(5), '0,05');
  assert.equal(centsToEuroInput(0), '');
});

test('liest Eurobetraege ohne Rundungsfehler als Cent', () => {
  assert.equal(euroInputToCents('12,50'), 1250);
  assert.equal(euroInputToCents('12.50'), 1250);
  assert.equal(euroInputToCents('1.234,56 €'), 123456);
  assert.equal(euroInputToCents('19'), 1900);
});

test('weist leere und unvollstaendige Betraege ab', () => {
  assert.equal(euroInputToCents(''), null);
  assert.equal(euroInputToCents('12,'), null);
  assert.equal(euroInputToCents('abc'), null);
});
