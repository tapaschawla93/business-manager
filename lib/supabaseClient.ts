import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key). Use only after NEXT_PUBLIC_* env vars are set.
 */
export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
  }

  browserClient = createClient(url, anonKey);
  return browserClient;
}

/**
 * Ensures a row exists in businesses + profiles for the current session user.
 * Idempotent: safe to call after every sign-in; returns existing business_id if already onboarded.
 */
export async function ensureBusinessForCurrentUser(
  businessName?: string
): Promise<{ data: string | null; error: Error | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_business_for_user', {
    p_business_name: businessName ?? 'My Business',
  });

  if (error) {
    const msg = error.message;
    const m = msg.toLowerCase();
    const looksLikeMissingSchema =
      m.includes('create_business_for_user') ||
      m.includes('could not find the function') ||
      m.includes('schema cache') ||
      (m.includes('relation') && m.includes('does not exist'));
    const hint =
      ' Open your Supabase project → SQL Editor → paste and run `supabase/schema.sql` from this app (repo root), then sign in again.';
    return {
      data: null,
      error: new Error(looksLikeMissingSchema ? msg + hint : msg),
    };
  }

  return { data: data as string, error: null };
}
