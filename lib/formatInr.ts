/**
 * UI-only formatting for Indian Rupee display. Does not change stored values.
 * Uses en-IN grouping (e.g. thousands/lakhs separators) and up to 2 decimal places.
 */
export function formatInrDisplay(amount: number): string {
  if (!Number.isFinite(amount)) return '₹—';
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}`;
}
