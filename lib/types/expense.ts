/** V1 expenses row — matches public.expenses */
export type Expense = {
  id: string;
  business_id: string;
  date: string;
  vendor_name: string;
  /** Optional linked vendor (see `vendors` table). */
  vendor_id: string | null;
  item_description: string;
  /** When set, quantity increases inventory for this product. */
  product_id: string | null;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  payment_mode: 'cash' | 'online';
  /** When true and `product_id` is set, stock delta runs on insert/update. Omitted on legacy rows until migration. */
  update_inventory?: boolean;
  /** Non-inventory label (e.g. Marketing). Null for stock purchases. */
  category: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInsert = {
  business_id: string;
  date: string;
  vendor_name: string;
  vendor_id?: string | null;
  item_description: string;
  product_id?: string | null;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  payment_mode: 'cash' | 'online';
  notes: string | null;
  update_inventory?: boolean;
  category?: string | null;
};
