import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Minimal catalog row so sales/expenses can reference the product; user edits category/MRP later.
 */
export async function insertStubProductForInventory(
  supabase: SupabaseClient,
  businessId: string,
  name: string,
  unitCost: number,
): Promise<{ id: string | null; error: string | null }> {
  const cost = Math.max(0, Number(unitCost));
  if (!Number.isFinite(cost)) {
    return { id: null, error: 'invalid unit cost for stub product' };
  }
  const { data, error } = await supabase
    .from('products')
    .insert({
      business_id: businessId,
      name: name.trim(),
      category: 'GENERAL',
      mrp: cost,
      cost_price: cost,
      variant: null,
      hsn_code: null,
      tax_pct: null,
    })
    .select('id')
    .single();

  if (error) {
    return { id: null, error: error.message };
  }
  return { id: data?.id as string, error: null };
}
