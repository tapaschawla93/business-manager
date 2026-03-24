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
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as string, error: null };
}
