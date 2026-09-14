export type HistoryRow = Record<string, unknown>;

export type SalesHistoryFilter = {
  month: string;
  date: string;
  venue: string;
};

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function amount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function marketVenue(
  sale: HistoryRow,
  markets: HistoryRow[],
): { key: string; label: string } {
  const marketId = text(sale.marketId);
  const market = markets.find((item) => text(item.id) === marketId);
  const name = text(market?.name);
  const location = text(market?.location);
  return {
    key: `market:${marketId}`,
    label:
      [name, location].filter(Boolean).join(' · ') ||
      'Markt nicht mehr vorhanden',
  };
}

export function onlineVenue(sale: HistoryRow) {
  const channel = text(sale.channel) || 'Online';
  return { key: `online:${channel}`, label: channel };
}

function matchesDate(row: HistoryRow, filter: SalesHistoryFilter) {
  const saleDate = text(row.date).slice(0, 10);
  return (
    (!filter.month || saleDate.slice(0, 7) === filter.month) &&
    (!filter.date || saleDate === filter.date)
  );
}

export function isWithinRecentCalendarDays(
  value: unknown,
  today: string,
  days = 7,
) {
  const date = text(value).slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !Number.isInteger(days) ||
    days < 1
  )
    return false;
  const firstDay = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(firstDay.getTime())) return false;
  firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));
  const start = firstDay.toISOString().slice(0, 10);
  return date >= start && date <= today;
}

export function filterSalesHistory(
  marketSales: HistoryRow[],
  onlineSales: HistoryRow[],
  markets: HistoryRow[],
  filter: SalesHistoryFilter,
) {
  return {
    marketSales: marketSales.filter(
      (sale) =>
        matchesDate(sale, filter) &&
        (!filter.venue || marketVenue(sale, markets).key === filter.venue),
    ),
    onlineSales: onlineSales.filter(
      (sale) =>
        matchesDate(sale, filter) &&
        (!filter.venue || onlineVenue(sale).key === filter.venue),
    ),
  };
}

export function expenseAmountCents(expense: HistoryRow) {
  if ('amountCents' in expense) return amount(expense.amountCents);
  return (
    amount(expense.priceCents) * Math.max(1, amount(expense.quantity) || 1)
  );
}
