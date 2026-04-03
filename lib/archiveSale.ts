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
): Promise<{ error: string | null; usedClientFallback: boolean }> {
  const { error: rpcErr } = await supabase.rpc('archive_sale', { p_sale_id: opts.saleId });
  if (!rpcErr) return { error: null, usedClientFallback: false };

  if (!isPostgrestMissingRpcError(rpcErr.message, rpcErr.code)) {
    return { error: saleRpcUserHint(rpcErr.message, rpcErr.code), usedClientFallback: false };
  }

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (saleErr) return { error: saleErr.message, usedClientFallback: false };
  if (!sale) return { error: 'Sale not found, already archived, or access denied.', usedClientFallback: false };

  const { data: items, error: itemsErr } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', opts.saleId);

  if (itemsErr) return { error: itemsErr.message, usedClientFallback: false };

  for (const row of items ?? []) {
    const qty = Number(row.quantity);
    if (!row.product_id || !Number.isFinite(qty)) continue;

    const { data: pcs, error: pcErr } = await supabase
      .from('product_components')
      .select('inventory_item_id, quantity_per_unit')
      .eq('product_id', row.product_id);

    if (pcErr) return { error: pcErr.message, usedClientFallback: false };

    if (!pcs?.length) {
      const { error: dErr } = await supabase.rpc('inventory_apply_delta_for_tenant', {
        p_business_id: opts.businessId,
        p_product_id: row.product_id,
        p_delta: qty,
      });
      if (dErr) return { error: dErr.message, usedClientFallback: false };
      continue;
    }

    for (const pc of pcs as Array<{ inventory_item_id: string; quantity_per_unit: number | string }>) {
      const per = Number(pc.quantity_per_unit);
      if (!pc.inventory_item_id || !Number.isFinite(per)) continue;
      const add = Math.round(per * qty * 1000) / 1000;
      const { data: curRow, error: fetchErr } = await supabase
        .from('inventory_items')
        .select('current_stock')
        .eq('id', pc.inventory_item_id)
        .eq('business_id', opts.businessId)
        .maybeSingle();
      if (fetchErr) return { error: fetchErr.message, usedClientFallback: false };
      const next = Math.round((Number(curRow?.current_stock ?? 0) + add) * 1000) / 1000;
      const { error: upErr } = await supabase
        .from('inventory_items')
        .update({ current_stock: next })
        .eq('id', pc.inventory_item_id)
        .eq('business_id', opts.businessId);
      if (upErr) return { error: upErr.message, usedClientFallback: false };
    }
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

  if (upErr) return { error: upErr.message, usedClientFallback: false };

  const { data: stillActive, error: verErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (verErr) return { error: verErr.message, usedClientFallback: false };
  if (stillActive) return { error: 'Sale not found, already archived, or access denied.', usedClientFallback: false };

  return { error: null, usedClientFallback: true };
}
