import type { SupabaseClient } from '@supabase/supabase-js';
import { isPostgrestMissingRpcError, saleRpcUserHint } from '@/lib/saleRpcUserHint';

/**
 * Permanently removes a sale via `archive_sale` RPC (restores stock, deletes `sale_items` + `sales`).
 *
 * **Production:** If the RPC is missing from PostgREST, returns an error — no client-side multi-step fallback
 * (avoids inconsistent stock vs sale state when a mid-flight request fails).
 *
 * **Development:** Same missing-RPC detection may still run a best-effort fallback for local work without migrations.
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

  if (process.env.NODE_ENV === 'production') {
    return {
      error:
        'Cannot remove sale: the database function archive_sale is not available. Apply the latest Supabase migrations, reload the API schema cache if needed, and try again.',
      usedClientFallback: false,
    };
  }

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (saleErr) return { error: saleErr.message, usedClientFallback: false };
  if (!sale) return { error: 'Sale not found, already removed, or access denied.', usedClientFallback: false };

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

  const { error: delLinesErr } = await supabase.from('sale_items').delete().eq('sale_id', opts.saleId);
  if (delLinesErr) return { error: delLinesErr.message, usedClientFallback: false };

  const { error: delSaleErr } = await supabase
    .from('sales')
    .delete()
    .eq('id', opts.saleId)
    .eq('business_id', opts.businessId);

  if (delSaleErr) return { error: delSaleErr.message, usedClientFallback: false };

  const { data: stillThere, error: verErr } = await supabase
    .from('sales')
    .select('id')
    .eq('id', opts.saleId)
    .maybeSingle();

  if (verErr) return { error: verErr.message, usedClientFallback: false };
  if (stillThere) return { error: 'Sale not found, already removed, or access denied.', usedClientFallback: false };

  return { error: null, usedClientFallback: true };
}
