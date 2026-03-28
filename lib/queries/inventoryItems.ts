import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem } from '@/lib/types/inventoryItem';

/** Matches `.select()` — avoid `*` so schema drift is visible in one place. */
export const INVENTORY_ITEM_COLUMNS =
  'id, business_id, name, unit, current_stock, unit_cost, reorder_level, product_id, created_at, updated_at';

/** Raw row from PostgREST (numeric columns may arrive as string). */
type InventoryItemRow = {
  id: string;
  business_id: string;
  name: string;
  unit: string;
  current_stock: string | number;
  unit_cost: string | number;
  reorder_level: string | number | null;
  product_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapInventoryItem(row: InventoryItemRow): InventoryItem {
  const reorder = row.reorder_level;
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    unit: row.unit,
    current_stock: Number(row.current_stock),
    unit_cost: Number(row.unit_cost),
    reorder_level: reorder == null || reorder === '' ? null : Number(reorder),
    product_id: row.product_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchInventoryItems(
  supabase: SupabaseClient,
  options?: { businessId?: string },
): Promise<{ data: InventoryItem[] | null; error: Error | null }> {
  let q = supabase.from('inventory_items').select(INVENTORY_ITEM_COLUMNS).order('name', { ascending: true });

  if (options?.businessId) {
    q = q.eq('business_id', options.businessId);
  }

  const { data, error } = await q;
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  const rows = (data ?? []) as InventoryItemRow[];
  return { data: rows.map(mapInventoryItem), error: null };
}
