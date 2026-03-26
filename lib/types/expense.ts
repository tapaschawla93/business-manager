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
};
