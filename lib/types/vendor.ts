/** Tenant vendor directory — matches public.vendors */
export type Vendor = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
