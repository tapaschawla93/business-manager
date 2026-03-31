export function keyProducts(r: Record<string, unknown>): string {
  return `${String(r.name ?? '').trim().toLowerCase()}::${String(r.category ?? '').trim().toLowerCase()}`;
}

export function keyInventory(r: Record<string, unknown>): string {
  return String(r.name ?? '').trim().toLowerCase();
}

export function keyCustomers(r: Record<string, unknown>): string {
  return String(r.phone ?? '').trim();
}

export function keyVendors(r: Record<string, unknown>): string {
  return String(r.name ?? '').trim().toLowerCase();
}

export function keySales(r: Record<string, unknown>): string {
  return String(r.id ?? '').trim();
}

export function keyExpenses(r: Record<string, unknown>): string {
  return [
    String(r.date ?? '').trim(),
    String(r.vendor_name ?? '').trim().toLowerCase(),
    String(r.item_description ?? '').trim().toLowerCase(),
    Number(r.total_amount ?? 0).toFixed(2),
  ].join('::');
}
