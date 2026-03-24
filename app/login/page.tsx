'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureBusinessForCurrentUser, getSupabaseClient } from '@/lib/supabaseClient';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = getSupabaseClient();

    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        // Email confirmation: no JWT until user confirms — onboarding RPC needs auth.uid().
        if (!signUpData.session) {
          setInfo(
            'If your project requires email confirmation, open the link in your email, then sign in. Your business is created on first successful sign-in.'
          );
          setLoading(false);
          return;
        }
      }

      // Provisions businesses + profiles via RLS-safe RPC (no direct table INSERT from client).
      const { error: onboardError } = await ensureBusinessForCurrentUser(
        mode === 'sign-up' ? businessName || undefined : undefined
      );
      if (onboardError) throw onboardError;

      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-3">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Email and password. New accounts get a business row via secure onboarding.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {mode === 'sign-up' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="business">
                Business name (optional)
              </label>
              <input
                id="business"
                type="text"
                autoComplete="organization"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                placeholder="My Business"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            />
          </div>

          {info && <p className="text-xs text-slate-600">{info}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading
              ? mode === 'sign-in'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'sign-in'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <div className="mt-3 text-center text-xs text-slate-600">
          {mode === 'sign-in' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('sign-up')}
                className="font-medium text-slate-900 underline underline-offset-2"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('sign-in')}
                className="font-medium text-slate-900 underline underline-offset-2"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
