'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';

const BOOTSTRAP_MS = 25_000;
const TIMEOUT_MSG =
  'Supabase did not respond in time. Check your network, VPN, or ad blockers, then refresh the page.';

export type BusinessSessionStatus =
  | { kind: 'loading' }
  | { kind: 'redirect_login' }
  | { kind: 'redirect_home' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; businessId: string; email: string | null };

type Options = { onMissingBusiness: 'error' | 'redirect-home' };

type BootstrapResult =
  | { t: 'error'; message: string }
  | { t: 'redirect_login' }
  | { t: 'redirect_home' }
  | { t: 'ready'; businessId: string; email: string | null };

async function runBootstrap(onMissingBusiness: Options['onMissingBusiness']): Promise<BootstrapResult> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { t: 'error', message: userErr.message };

  const user = userData.user;
  if (!user) return { t: 'redirect_login' };

  const { data: profile, error: pe } = await supabase.from('profiles').select('business_id').maybeSingle();
  if (pe) return { t: 'error', message: pe.message };

  if (!profile?.business_id) {
    if (onMissingBusiness === 'redirect-home') return { t: 'redirect_home' };
    return {
      t: 'error',
      message: 'No business profile. Sign out and sign in again so onboarding can finish.',
    };
  }

  return {
    t: 'ready',
    businessId: profile.business_id,
    email: user.email ?? null,
  };
}

/**
 * Resolves Supabase session + `profiles.business_id` once on mount.
 * Uses a generation counter so Strict Mode / fast remounts cannot leave UI stuck on `loading`.
 */
export function useBusinessSession(options: Options): BusinessSessionStatus {
  const { onMissingBusiness } = options;
  const router = useRouter();
  const [status, setStatus] = useState<BusinessSessionStatus>({ kind: 'loading' });
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;

    void (async () => {
      try {
        const result = await withTimeout(
          runBootstrap(onMissingBusiness),
          BOOTSTRAP_MS,
          TIMEOUT_MSG,
        );
        if (gen !== genRef.current) return;

        switch (result.t) {
          case 'error':
            setStatus({ kind: 'error', message: result.message });
            break;
          case 'redirect_login':
            setStatus({ kind: 'redirect_login' });
            router.replace('/login');
            break;
          case 'redirect_home':
            setStatus({ kind: 'redirect_home' });
            router.replace('/');
            break;
          case 'ready':
            setStatus({
              kind: 'ready',
              businessId: result.businessId,
              email: result.email,
            });
            break;
        }
      } catch (e) {
        if (gen !== genRef.current) return;
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to verify session',
        });
      }
    })();
  }, [router, onMissingBusiness]);

  return status;
}
