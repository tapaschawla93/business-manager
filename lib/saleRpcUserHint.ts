/** True when PostgREST/Postgres reports the RPC is missing from the schema cache or catalog. */
export function isPostgrestMissingRpcError(message: string | undefined, code?: string): boolean {
  const raw = message ?? '';
  const lower = raw.toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    lower.includes('could not find') ||
    lower.includes('function public.') ||
    lower.includes('does not exist')
  );
}

/**
 * Maps PostgREST “missing RPC” style errors to an actionable hint (migrations not applied on the project).
 */
export function saleRpcUserHint(message: string | undefined, code?: string): string {
  const raw = message ?? 'Request failed';
  if (isPostgrestMissingRpcError(raw, code)) {
    return `${raw} — Run migration 20260401160000_sale_archive_update_inventory_delete_rpc.sql in the Supabase SQL editor (or supabase db push), then reload the app.`;
  }
  return raw;
}
