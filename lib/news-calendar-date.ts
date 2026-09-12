type DatedNewsEntry = {
  ereignisDatum?: unknown;
  veroeffentlichungsDatum?: unknown;
};

function dateText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).slice(0, 10)
    : '';
}

export function newsCalendarDate(entry: DatedNewsEntry) {
  return (
    dateText(entry.ereignisDatum) || dateText(entry.veroeffentlichungsDatum)
  );
}

export function newsCalendarInstant(entry: DatedNewsEntry) {
  const date = newsCalendarDate(entry);
  return date ? `${date}T12:00:00.000Z` : new Date().toISOString();
}
