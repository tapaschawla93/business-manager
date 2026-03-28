/** Matches `public.inventory_items` (manual inventory V2). */
export type InventoryItem = {
  id: string;
  business_id: string;
  name: string;
  unit: string;
  current_stock: number;
  unit_cost: number;
  reorder_level: number | null;
  product_id: string | null;
  created_at: string;
  updated_at: string;
};
