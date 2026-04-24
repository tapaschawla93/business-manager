import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleTag } from '@/lib/types/saleTag';

export async function fetchSaleTags(supabase: SupabaseClient): Promise<{
  data: SaleTag[] | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('sale_tags')
    .select('id, business_id, label, deleted_at, created_at, updated_at')
    .is('deleted_at', null)
    .order('label', { ascending: true });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as SaleTag[]) ?? [], error: null };
}

/** `businesses.default_sale_tag_id` for the signed-in tenant. */
export async function fetchDefaultSaleTagId(supabase: SupabaseClient): Promise<{
  data: string | null;
  error: Error | null;
}> {
  const { data: prof, error: pErr } = await supabase.from('profiles').select('business_id').maybeSingle();
  if (pErr) return { data: null, error: new Error(pErr.message) };
  const bid = prof?.business_id as string | undefined;
  if (!bid) return { data: null, error: null };
  const { data: bus, error: bErr } = await supabase
    .from('businesses')
    .select('default_sale_tag_id')
    .eq('id', bid)
    .maybeSingle();
  if (bErr) return { data: null, error: new Error(bErr.message) };
  const id = bus?.default_sale_tag_id as string | null | undefined;
  return { data: id ?? null, error: null };
}

export async function createSaleTag(
  supabase: SupabaseClient,
  businessId: string,
  label: string,
): Promise<{ data: SaleTag | null; error: Error | null }> {
  const trimmed = label.trim();
  if (!trimmed) return { data: null, error: new Error('Tag label is required') };
  const { data, error } = await supabase
    .from('sale_tags')
    .insert({ business_id: businessId, label: trimmed })
    .select('id, business_id, label, deleted_at, created_at, updated_at')
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as SaleTag, error: null };
}

export async function updateBusinessDefaultSaleTag(
  supabase: SupabaseClient,
  businessId: string,
  tagId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('businesses')
    .update({ default_sale_tag_id: tagId })
    .eq('id', businessId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Permanently removes the tag; `sales` / `expenses` / default pointer null out via FK (migration `20260402150000`). */
export async function archiveSaleTag(supabase: SupabaseClient, tagId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('sale_tags').delete().eq('id', tagId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function renameSaleTag(
  supabase: SupabaseClient,
  tagId: string,
  label: string,
): Promise<{ error: Error | null }> {
  const trimmed = label.trim();
  if (!trimmed) return { error: new Error('Label is required') };
  const { error } = await supabase.from('sale_tags').update({ label: trimmed }).eq('id', tagId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
