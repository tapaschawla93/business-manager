/** V1 expenses row — matches public.expenses */
export type Expense = {
  id: string;
  business_id: string;
  date: string;
  vendor_name: string;
  item_description: string;
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
  item_description: string;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  payment_mode: 'cash' | 'online';
  notes: string | null;
};
