/** Active sales header row (RLS hides soft-deleted). */
export type Sale = {
  id: string;
  business_id: string;
  date: string;
  customer_name: string;
  payment_mode: 'cash' | 'online';
  total_amount: number;
  total_cost: number;
  total_profit: number;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  sale_price: number;
  cost_price_snapshot: number;
  mrp_snapshot: number;
  vs_mrp: number;
  profit: number;
  created_at: string;
  updated_at: string;
};
