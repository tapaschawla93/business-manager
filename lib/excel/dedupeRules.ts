import { customerPhoneDedupeKey, normalizePhoneDigits } from '@/lib/queries/customers';
import { normalizeProductNameKey } from '@/lib/excel/resolveSaleProductId';

export function keyProducts(r: Record<string, unknown>): string {
  const name = String(r.name ?? '').trim().toLowerCase();
  const category = String(r.category ?? '').trim().toLowerCase();
  const variant = String(r.variant ?? '').trim().toLowerCase();
  return `${name}::${category}::${variant}`;
}

export function keyInventory(r: Record<string, unknown>): string {
  return String(r.name ?? '').trim().toLowerCase();
}

/** Workbook customer row identity — digit-normalized phone when possible (see `customerPhoneDedupeKey`). */
export function keyCustomers(r: Record<string, unknown>): string {
  return customerPhoneDedupeKey(String(r.phone ?? ''));
}

export function keyVendors(r: Record<string, unknown>): string {
  return String(r.name ?? '').trim().toLowerCase();
}

/**
 * Sales sheet `id`: your per-row import label (e.g. IMPORT-001), not the DB UUID.
 * Empty or `<...>` placeholder → synthetic key from date + phone + line so the row can import once.
 * Line identity uses `product_id` when it is a non-placeholder value, else normalized `product_name`.
 */
export function keySales(r: Record<string, unknown>): string {
  const raw = String(r.id ?? '').trim();
  if (raw && !raw.startsWith('<')) return raw;
  const date = String(r.date ?? '').trim();
  const pid = String(r.product_id ?? '').trim();
  const pnm = normalizeProductNameKey(String(r.product_name ?? ''));
  const pvr = normalizeProductNameKey(String(r.variant ?? r.product_variant ?? ''));
  const nameLine = pnm ? `n:${pnm}${pvr ? `::v:${pvr}` : ''}` : '';
  const lineKey = pid && !pid.startsWith('<') ? pid : nameLine;
  const ph = normalizePhoneDigits(String(r.customer_phone ?? ''));
  if (date && lineKey) {
    return `gen:${date}|${ph ?? 'np'}|${lineKey}|${Number(r.quantity ?? 0)}|${Number(r.sale_price ?? 0)}`;
  }
  return '';
}

export function keyExpenses(r: Record<string, unknown>): string {
  return [
    String(r.date ?? '').trim(),
    String(r.vendor_name ?? '').trim().toLowerCase(),
    String(r.item_description ?? '').trim().toLowerCase(),
    Number(r.total_amount ?? 0).toFixed(2),
  ].join('::');
}
