import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseOccursInMonth } from '../lib/recurring-expenses';

void test('monatliche Ausgaben gelten vom Start bis einschließlich Endmonat', () => {
  assert.equal(
    expenseOccursInMonth('2026-01-13', '2026-03-31', 'monthly', '2026-02'),
    true,
  );
  assert.equal(
    expenseOccursInMonth('2026-01-13', '2026-03-31', 'monthly', '2026-04'),
    false,
  );
});

void test('jährliche Ausgaben werden nur im ursprünglichen Monat berücksichtigt', () => {
  assert.equal(
    expenseOccursInMonth('2025-09-01', '', 'yearly', '2026-09'),
    true,
  );
  assert.equal(
    expenseOccursInMonth('2025-09-01', '', 'yearly', '2026-08'),
    false,
  );
});

void test('einmalige Ausgaben erscheinen ausschließlich im Rechnungsmonat', () => {
  assert.equal(expenseOccursInMonth('2026-09-08', '', 'none', '2026-09'), true);
  assert.equal(
    expenseOccursInMonth('2026-09-08', '', 'none', '2026-10'),
    false,
  );
});
