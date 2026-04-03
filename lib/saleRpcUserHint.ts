/** True when PostgREST/Postgres reports the RPC is missing from the schema cache or catalog. */
export function isPostgrestMissingRpcError(message: string | undefined, code?: string): boolean {
  if (code === 'PGRST202' || code === '42883') return true;
  const raw = message ?? '';
  const lower = raw.toLowerCase();
  if (lower.includes('schema cache') && (lower.includes('function') || lower.includes('procedure'))) {
    return true;
  }
  if (lower.includes('function') && lower.includes('does not exist')) {
    return true;
  }
  return false;
}

/**
 * Maps PostgREST “missing RPC” style errors to an actionable hint (migrations not applied on the project).
 */
export function saleRpcUserHint(message: string | undefined, code?: string): string {
  const raw = message ?? 'Request failed';
  if (isPostgrestMissingRpcError(raw, code)) {
    return `${raw} — Run migration 20260401160000_sale_archive_update_inventory_delete_rpc.sql in the Supabase SQL editor (or supabase db push), then reload the app.`;
  }
  if (raw.includes('Insufficient stock for this sale (inventory would go negative)')) {
    return `${raw} For assembly items: save a BOM on Products, apply latest Supabase migrations (includes BOM-aware ledger skip), and ensure component lines have enough stock. For simple SKUs: stock-in linked to the product.`;
  }
  return raw;
}
