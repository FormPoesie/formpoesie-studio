import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expenseAmountCents,
  filterSalesHistory,
  isWithinRecentCalendarDays,
  marketVenue,
} from '../lib/sales-history';

const markets = [
  { id: 2, name: 'BurgSommer – Samstag', location: 'Burg Linn' },
  { id: 4, name: 'BurgSommer – Sonntag' },
];

void test('Verkaufshistorie filtert Markt und Datum gemeinsam', () => {
  const result = filterSalesHistory(
    [
      { id: 1, marketId: 2, date: '2026-08-22' },
      { id: 2, marketId: 4, date: '2026-08-23' },
    ],
    [{ id: 3, channel: 'Etsy', date: '2026-08-22' }],
    markets,
    { month: '2026-08', date: '2026-08-22', venue: 'market:2' },
  );
  assert.deepEqual(
    result.marketSales.map((sale) => sale.id),
    [1],
  );
  assert.equal(result.onlineSales.length, 0);
  assert.equal(
    marketVenue(result.marketSales[0], markets).label,
    'BurgSommer – Samstag · Burg Linn',
  );
});

void test('Marktkosten und sonstige Ausgaben werden centgenau übernommen', () => {
  assert.equal(expenseAmountCents({ amountCents: 750 }), 750);
  assert.equal(expenseAmountCents({ priceCents: 499, quantity: 3 }), 1497);
});

void test('Startseitenerfolge umfassen auch den Sonntag vor einem Montag', () => {
  assert.equal(
    isWithinRecentCalendarDays('2026-09-13', '2026-09-14'),
    true,
  );
  assert.equal(
    isWithinRecentCalendarDays('2026-09-08', '2026-09-14'),
    true,
  );
  assert.equal(
    isWithinRecentCalendarDays('2026-09-07', '2026-09-14'),
    false,
  );
  assert.equal(
    isWithinRecentCalendarDays('2026-09-15', '2026-09-14'),
    false,
  );
});
