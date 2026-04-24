'use client';

import { FormEvent, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureBusinessForCurrentUser, getSupabaseClient } from '@/lib/supabaseClient';
import { acceptPendingBusinessInvitation, getCurrentUserOnboardingGate } from '@/lib/queries/teamMembers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const router = useRouter();
  /** Prevents onAuthStateChange from calling finalize before handleSubmit; avoids creating business as "My Business" before the form name is applied. */
  const manualAuthFlowInProgress = useRef(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const finalizePostAuth = useCallback(
    async (businessNameForNewAccount?: string): Promise<{ destination: 'home' | 'set-password' }> => {
      const supabase = getSupabaseClient();
      const { data: gate, error: gateErr } = await getCurrentUserOnboardingGate(supabase);
      if (gateErr) throw gateErr;
      if (gate === 'revoked_member' || gate === 'revoked_invite' || gate === 'expired_invite') {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Your access was revoked or invite expired. Ask the business owner to send a new invitation.');
      }
      const { data: invitedBusinessId, error: inviteErr } = await acceptPendingBusinessInvitation(supabase);
      if (inviteErr) throw inviteErr;
      if (invitedBusinessId) return { destination: 'set-password' };
      const { error: onboardError } = await ensureBusinessForCurrentUser(businessNameForNewAccount);
      if (onboardError) throw onboardError;
      return { destination: 'home' };
    },
    [],
  );

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function bootstrapSession() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return;

      if (data.session) {
        try {
          const result = await finalizePostAuth();
          router.replace(result.destination === 'set-password' ? '/set-password' : '/');
          router.refresh();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to complete sign-in';
          setError(message);
        }
      }
    }

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session) {
        return;
      }
      if (manualAuthFlowInProgress.current) {
        return;
      }
      try {
        const result = await finalizePostAuth();
        router.replace(result.destination === 'set-password' ? '/set-password' : '/');
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to complete sign-in';
        setError(message);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, finalizePostAuth]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    manualAuthFlowInProgress.current = true;
    const supabase = getSupabaseClient();

    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const emailRedirectTo =
          typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });
        if (signUpError) throw signUpError;
        if (!signUpData.session) {
          setInfo(
            'If your project requires email confirmation, open the link in your email, then sign in. Your business is created on first successful sign-in.',
          );
          setLoading(false);
          manualAuthFlowInProgress.current = false;
          return;
        }
      }

      const nameForOnboarding = mode === 'sign-up' ? businessName.trim() || undefined : undefined;
      const result = await finalizePostAuth(nameForOnboarding);
      if (mode === 'sign-up' && nameForOnboarding) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: prof } = await supabase.from('profiles').select('business_id').eq('id', u.user.id).maybeSingle();
          const bid = prof?.business_id as string | undefined;
          if (bid) {
            const { error: nameErr } = await supabase.from('businesses').update({ name: nameForOnboarding }).eq('id', bid);
            if (nameErr) {
              toast.error(`Could not save business name: ${nameErr.message}`);
            } else if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('bizmanager:business-name-updated', { detail: nameForOnboarding }));
            }
          }
        }
      }
      router.replace(result.destination === 'set-password' ? '/set-password' : '/');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
      manualAuthFlowInProgress.current = false;
    }
  }

  return (
    <div className="relative flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <TrendingUp className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </div>
          <span className="text-xl font-bold tracking-tight">BizManager</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">Your business operating system</h2>
          <p className="text-base text-primary-foreground/85">
            Sales, expenses, and product catalogue in one workspace — built for mobile-first ops.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">V1 · Secure multi-tenant workspace</p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center bg-background px-4 py-12 lg:w-1/2">
        <Card className="w-full max-w-md border-border/80 shadow-xl">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="text-2xl font-bold">{mode === 'sign-in' ? 'Welcome back' : 'Create account'}</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {mode === 'sign-in'
                ? 'Sign in with email and password to open your dashboard.'
                : 'Email and password. A business row is created on first sign-in.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {mode === 'sign-up' && (
                <div className="space-y-2">
                  <Label htmlFor="business" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Business name (optional)
                  </Label>
                  <Input
                    id="business"
                    type="text"
                    autoComplete="organization"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="My Business"
                    className="rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {info && <p className="text-xs text-muted-foreground">{info}</p>}
              {error && (
                <p className="whitespace-pre-wrap break-words text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" size="full" disabled={loading} className="h-12 rounded-xl text-base font-semibold">
                {loading
                  ? mode === 'sign-in'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'sign-in'
                    ? 'Sign in'
                    : 'Create account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'sign-in' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setMode('sign-up')}
                    className="h-auto px-0 py-0 text-sm font-semibold"
                  >
                    Create one
                  </Button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setMode('sign-in')}
                    className="h-auto px-0 py-0 text-sm font-semibold"
                  >
                    Sign in
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
