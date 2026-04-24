/** Row in `sale_tags` (tenant dictionary for sales + expenses). */
export type SaleTag = {
  id: string;
  business_id: string;
  label: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
