type DatedNewsEntry = {
  ereignisDatum?: unknown;
  veroeffentlichungsDatum?: unknown;
  erfasstAm?: unknown;
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

export function newsActivityDate(entry: DatedNewsEntry) {
  return dateText(entry.erfasstAm) || newsCalendarDate(entry);
}

export function newsActivityInstant(entry: DatedNewsEntry) {
  const date = newsActivityDate(entry);
  return date ? `${date}T12:00:00.000Z` : new Date().toISOString();
}
