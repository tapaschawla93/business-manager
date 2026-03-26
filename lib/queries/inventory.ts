import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/lib/types/product';

export type InventoryProductRow = Product & {
  quantity_on_hand: number;
  inventory_value: number;
};

/**
 * Active products with on-hand quantity (0 when no inventory row) and extension value at catalog cost.
 */
export async function fetchInventoryOverview(
  supabase: SupabaseClient,
  options?: { businessId?: string },
): Promise<{ data: InventoryProductRow[] | null; error: Error | null }> {
  let pq = supabase.from('products').select('*').is('deleted_at', null).order('name', { ascending: true });
  let iq = supabase.from('inventory').select('product_id, quantity_on_hand');

  if (options?.businessId) {
    pq = pq.eq('business_id', options.businessId);
    iq = iq.eq('business_id', options.businessId);
  }

  const [pr, ir] = await Promise.all([pq, iq]);

  if (pr.error) {
    return { data: null, error: new Error(pr.error.message) };
  }
  if (ir.error) {
    return { data: null, error: new Error(ir.error.message) };
  }

  const qtyByProduct = new Map<string, number>();
  for (const row of ir.data ?? []) {
    const r = row as { product_id: string; quantity_on_hand: number };
    qtyByProduct.set(r.product_id, Number(r.quantity_on_hand));
  }

  const products = (pr.data ?? []) as Product[];
  const mapped: InventoryProductRow[] = products.map((p) => {
    const qoh = qtyByProduct.get(p.id) ?? 0;
    const cost = Number(p.cost_price);
    const value = Number.isFinite(qoh) && Number.isFinite(cost) ? Math.round(qoh * cost * 100) / 100 : 0;
    return {
      ...p,
      quantity_on_hand: Number.isFinite(qoh) ? qoh : 0,
      inventory_value: value,
    };
  });

  return { data: mapped, error: null };
}

/** Map product id → quantity on hand for sales hints. */
export async function fetchStockByProductId(
  supabase: SupabaseClient,
): Promise<{ data: Record<string, number> | null; error: Error | null }> {
  const { data, error } = await supabase.from('inventory').select('product_id, quantity_on_hand');

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as { product_id: string; quantity_on_hand: number };
    map[r.product_id] = Number(r.quantity_on_hand);
  }
  return { data: map, error: null };
}
