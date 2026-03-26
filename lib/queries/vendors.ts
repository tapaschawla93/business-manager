import type { SupabaseClient } from '@supabase/supabase-js';
import type { Vendor } from '@/lib/types/vendor';

export async function fetchActiveVendors(
  supabase: SupabaseClient,
  options_?: { businessId?: string },
): Promise<{ data: Vendor[] | null; error: Error | null }> {
  let q = supabase.from('vendors').select('*').order('name', { ascending: true });

  if (options_?.businessId) {
    q = q.eq('business_id', options_.businessId);
  }

  const { data, error } = await q;
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as Vendor[], error: null };
}

export async function fetchVendorById(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: Vendor | null; error: Error | null }> {
  const { data, error } = await supabase.from('vendors').select('*').eq('id', id).maybeSingle();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as Vendor | null, error: null };
}
