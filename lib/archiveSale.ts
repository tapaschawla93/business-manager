import type { SupabaseClient } from '@supabase/supabase-js';
import { isPostgrestMissingRpcError, saleRpcUserHint } from '@/lib/saleRpcUserHint';

/**
 * Soft-archives a sale: prefers `archive_sale` RPC; if that RPC is missing from PostgREST, applies
 * the same inventory restores as the server (`inventory_apply_delta` per line) via
 * `inventory_apply_delta_for_tenant`, then sets `sales.deleted_at`. Not atomic across round trips.
 */
export async function archiveSaleWithClientFallback(
  supabase: SupabaseClient,
  opts: { saleId: string; businessId: string },
): Promise<{ error: string | null }> {
  const { error: rpcErr } = await supabase.rpc('archive_sale', { p_sale_id: opts.saleId });
  if (!rpcErr) return { error: null };

  if (!isPostgrestMissingRpcError(rpcErr.message, rpcErr.code)) {
    return { error: saleRpcUserHint(rpcErr.message, rpcErr.code) };
  }

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (saleErr) return { error: saleErr.message };
  if (!sale) return { error: 'Sale not found, already archived, or access denied.' };

  const { data: items, error: itemsErr } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', opts.saleId);

  if (itemsErr) return { error: itemsErr.message };

  for (const row of items ?? []) {
    const qty = Number(row.quantity);
    if (!row.product_id || !Number.isFinite(qty)) continue;
    const { error: dErr } = await supabase.rpc('inventory_apply_delta_for_tenant', {
      p_business_id: opts.businessId,
      p_product_id: row.product_id,
      p_delta: qty,
    });
    if (dErr) return { error: dErr.message };
  }

  // Do not chain `.select()` on this update: RETURNING rows must pass SELECT RLS, and
  // `sales_select_active` requires `deleted_at is null`, so returning an archived row fails
  // ("new row violates row-level security policy for table sales"). See 20250329120000.
  const { error: upErr } = await supabase
    .from('sales')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', opts.saleId)
    .eq('business_id', opts.businessId)
    .is('deleted_at', null);

  if (upErr) return { error: upErr.message };

  const { data: stillActive, error: verErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (verErr) return { error: verErr.message };
  if (stillActive) return { error: 'Sale not found, already archived, or access denied.' };

  return { error: null };
}
