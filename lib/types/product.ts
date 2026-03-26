/** V1 Product Repository row — matches public.products */
export type Product = {
  id: string;
  business_id: string;
  name: string;
  variant: string | null;
  category: string;
  mrp: number;
  cost_price: number;
  hsn_code: string | null;
  tax_pct: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductInsert = {
  business_id: string;
  name: string;
  variant: string | null;
  category: string;
  mrp: number;
  cost_price: number;
  hsn_code: string | null;
  tax_pct: number | null;
};
