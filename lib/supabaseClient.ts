import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/** True when public env vars are present (safe to call before `getSupabaseClient`). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && String(url).trim() && key && String(key).trim());
}

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
  const trimmed = businessName?.trim() ?? '';
  // Only pass a name when the caller set one. Omit the param for empty so Postgres default applies,
  // and we never send the literal "My Business" from the client on every session refresh.
  const args =
    trimmed === ''
      ? ({} as Record<string, never>)
      : { p_business_name: trimmed };
  const { data, error } = await supabase.rpc('create_business_for_user', args);

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
