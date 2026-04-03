import type { SupabaseClient } from '@supabase/supabase-js';

/** Count of `product_components` rows per product (0 = ledger-only SKU, no BOM deduction). */
export async function fetchProductComponentCounts(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{ data: Record<string, number> | null; error: Error | null }> {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) {
    return { data: {}, error: null };
  }

  const { data, error } = await supabase
    .from('product_components')
    .select('product_id')
    .in('product_id', unique);

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  const counts: Record<string, number> = {};
  for (const id of unique) {
    counts[id] = 0;
  }
  for (const row of data ?? []) {
    const pid = (row as { product_id: string }).product_id;
    counts[pid] = (counts[pid] ?? 0) + 1;
  }
  return { data: counts, error: null };
}

export type ComponentShortfall = {
  inventoryItemName: string;
  needed: number;
  available: number;
};

/**
 * Projects component-line demand vs `inventory_items.current_stock` (pre-save hint only).
 * Server still enforces non-negative stock via CHECK + RPC raises.
 */
export async function fetchComponentShortfallsForLines(
  supabase: SupabaseClient,
  lines: { product_id: string; quantity: number }[],
): Promise<{ data: ComponentShortfall[] | null; error: Error | null }> {
  if (lines.length === 0) {
    return { data: [], error: null };
  }

  const productIds = [...new Set(lines.map((l) => l.product_id))];
  const { data: pcs, error: pcErr } = await supabase
    .from('product_components')
    .select('product_id, inventory_item_id, quantity_per_unit')
    .in('product_id', productIds);

  if (pcErr) {
    return { data: null, error: new Error(pcErr.message) };
  }
  if (!pcs?.length) {
    return { data: [], error: null };
  }

  const itemIds = [...new Set(pcs.map((p) => (p as { inventory_item_id: string }).inventory_item_id))];
  const { data: items, error: itemErr } = await supabase
    .from('inventory_items')
    .select('id, name, current_stock')
    .in('id', itemIds);

  if (itemErr) {
    return { data: null, error: new Error(itemErr.message) };
  }

  const stock = new Map<string, { name: string; stock: number }>();
  for (const row of items ?? []) {
    const r = row as { id: string; name: string; current_stock: number };
    stock.set(r.id, { name: r.name, stock: Number(r.current_stock) });
  }

  const needByItemId = new Map<string, number>();
  for (const line of lines) {
    const qty = line.quantity;
    for (const pc of pcs) {
      const p = pc as { product_id: string; inventory_item_id: string; quantity_per_unit: number };
      if (p.product_id !== line.product_id) continue;
      const add = round3(Number(p.quantity_per_unit) * qty);
      const iid = p.inventory_item_id;
      needByItemId.set(iid, round3((needByItemId.get(iid) ?? 0) + add));
    }
  }

  const shortfalls: ComponentShortfall[] = [];
  for (const [itemId, need] of needByItemId) {
    const inv = stock.get(itemId);
    const have = inv ? inv.stock : 0;
    if (need > have) {
      shortfalls.push({
        inventoryItemName: inv?.name ?? 'Component',
        needed: need,
        available: have,
      });
    }
  }
  shortfalls.sort((a, b) => a.inventoryItemName.localeCompare(b.inventoryItemName));
  return { data: shortfalls, error: null };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
