'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureBusinessForCurrentUser, getSupabaseClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function bootstrapSession() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return;

      if (data.session) {
        const { error: onboardError } = await ensureBusinessForCurrentUser();
        if (!onboardError) {
          router.replace('/');
          router.refresh();
        }
      }
    }

    bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        const { error: onboardError } = await ensureBusinessForCurrentUser();
        if (!onboardError) {
          router.replace('/');
          router.refresh();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

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
        if (!signUpData.session) {
          setInfo(
            'If your project requires email confirmation, open the link in your email, then sign in. Your business is created on first successful sign-in.',
          );
          setLoading(false);
          return;
        }
      }

      const { error: onboardError } = await ensureBusinessForCurrentUser(
        mode === 'sign-up' ? businessName || undefined : undefined,
      );
      if (onboardError) throw onboardError;

      router.replace('/');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm rounded-xl border-border shadow-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">{mode === 'sign-in' ? 'Sign in' : 'Create account'}</CardTitle>
          <CardDescription>
            Email and password. New accounts get a business row via secure onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {mode === 'sign-up' && (
              <div className="space-y-2">
                <Label htmlFor="business">Business name (optional)</Label>
                <Input
                  id="business"
                  type="text"
                  autoComplete="organization"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="My Business"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {info && <p className="text-xs text-muted-foreground">{info}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full rounded-[10px] text-base font-semibold">
              {loading
                ? mode === 'sign-in'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {mode === 'sign-in' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('sign-up')}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
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
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
