export type ExpenseRecurrence = 'none' | 'monthly' | 'yearly';

function monthKey(value: string) {
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : '';
}

export function expenseOccursInMonth(
  invoiceDate: string,
  endDate: string,
  recurrence: ExpenseRecurrence,
  targetMonth: string,
) {
  const start = monthKey(invoiceDate);
  const end = monthKey(endDate);
  if (!start || !/^\d{4}-\d{2}$/.test(targetMonth)) return false;
  if (targetMonth < start || (end && targetMonth > end)) return false;
  if (recurrence === 'monthly') return true;
  if (recurrence === 'yearly') return targetMonth.slice(5) === start.slice(5);
  return targetMonth === start;
}
