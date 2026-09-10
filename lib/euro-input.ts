/** Formatiert gespeicherte Cent fuer ein deutsches Euro-Eingabefeld. */
export function centsToEuroInput(value: unknown): string {
  const cents = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (!cents) return '';
  return (Math.round(cents) / 100).toFixed(2).replace('.', ',');
}

/**
 * Akzeptiert 12,50, 12.50, 1.234,56 und optionale Eurozeichen.
 * Das Ergebnis bleibt ganzzahlig in Cent; unvollstaendige Eingaben liefern null.
 */
export function euroInputToCents(value: unknown): number | null {
  const raw = String(value ?? '')
    .trim()
    .replace(/[€\s]/g, '');
  if (!raw || !/^\d[\d.,]*$/.test(raw)) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  const digitsAfter = decimalIndex < 0 ? 0 : raw.length - decimalIndex - 1;
  if (decimalIndex >= 0 && digitsAfter === 0) return null;
  const hasDecimal = decimalIndex >= 0 && digitsAfter <= 2;
  const whole = (hasDecimal ? raw.slice(0, decimalIndex) : raw).replace(
    /[.,]/g,
    '',
  );
  const fraction = hasDecimal ? raw.slice(decimalIndex + 1) : '';
  if (!/^\d+$/.test(whole) || (fraction && !/^\d{1,2}$/.test(fraction)))
    return null;

  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}
