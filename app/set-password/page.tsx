'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      const [{ data: userRes, error: userErr }, { data: profile, error: profileErr }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('password_setup_required').maybeSingle(),
      ]);
      if (userErr || !userRes.user) {
        router.replace('/login');
        return;
      }
      if (profileErr) {
        setError(profileErr.message);
        setChecking(false);
        return;
      }
      const required = Boolean(profile?.password_setup_required);
      if (!required) {
        router.replace('/');
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const supabase = getSupabaseClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setLoading(false);
      setError(updateErr.message);
      return;
    }
    const { error: markErr } = await supabase.rpc('mark_password_setup_complete');
    setLoading(false);
    if (markErr) {
      setError(markErr.message);
      return;
    }
    toast.success('Password set. You can now sign in with email and password.');
    router.replace('/');
    router.refresh();
  }

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking account…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>Create a password now. Next time, sign in with email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="full" disabled={loading}>
              {loading ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
