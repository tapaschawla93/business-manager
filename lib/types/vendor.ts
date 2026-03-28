/** Tenant vendor directory — matches public.vendors */
export type Vendor = {
  id: string;
  business_id: string;
  name: string;
  /** Optional display / correspondence name (PRD v2.4.2). */
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Optional postal / street summary (PRD v2.4.2). */
  address: string | null;
  /** Soft archive; null = active (RLS hides archived rows from normal selects). */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
