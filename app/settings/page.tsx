'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { downloadBackupWorkbook } from '@/lib/excel/downloadBackupWorkbook';
import { SaleTagsSettingsCard } from '@/app/settings/components/SaleTagsSettingsCard';
import { BusinessNameSettingsCard } from '@/app/settings/components/BusinessNameSettingsCard';
import { TeamMembersSettingsCard } from '@/app/settings/components/TeamMembersSettingsCard';

export default function SettingsPage() {
  const router = useRouter();
  const [authGate, setAuthGate] = useState<'loading' | 'guest' | 'signed_in'>('loading');
  const [busy, setBusy] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getUser(),
          25_000,
          'Sign-in check timed out. Check your network, then refresh.',
        );
        if (error || !data.user) {
          router.replace('/login');
          setAuthGate('guest');
          return;
        }
        setAuthGate('signed_in');
        const { data: prof } = await supabase.from('profiles').select('business_id').maybeSingle();
        setBusinessId((prof?.business_id as string | undefined) ?? null);
      } catch {
        setAuthGate('guest');
        router.replace('/login');
      }
    })();
  }, [router]);

  async function handleBackup() {
    setBusy(true);
    try {
      await downloadBackupWorkbook(getSupabaseClient());
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  if (authGate === 'loading') {
    return <PageLoadingSkeleton />;
  }

  if (authGate === 'guest') {
    return <SessionRedirectNotice to="login" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Settings"
        description="Tags, defaults, and a local copy of your data. CSV templates and uploads live on each module (⋮ menu)."
      />

      <BusinessNameSettingsCard businessId={businessId} />
      <SaleTagsSettingsCard businessId={businessId} />
      <TeamMembersSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Backup workbook</CardTitle>
          <CardDescription>
            Same <code className="text-xs">.xlsx</code> as <strong>Export backup</strong> on the dashboard. For import
            order, per-sheet CSV, and Restore, see{' '}
            <Link href="/help" className="font-semibold text-primary underline-offset-4 hover:underline">
              Help
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full max-w-md justify-between px-4 font-medium"
            disabled={busy}
            onClick={() => void handleBackup()}
          >
            <span>{busy ? 'Downloading…' : 'Download backup (.xlsx)'}</span>
            <Download className="h-4 w-4 text-primary" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
