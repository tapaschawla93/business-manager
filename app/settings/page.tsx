'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { downloadBackupWorkbook } from '@/lib/excel/downloadBackupWorkbook';
import { downloadTemplateWorkbook } from '@/lib/excel/downloadTemplateWorkbook';
import { parseWorkbook } from '@/lib/excel/parseWorkbook';
import { uploadWorkbook } from '@/lib/excel/uploadWorkbook';

export default function SettingsPage() {
  const router = useRouter();
  const [authGate, setAuthGate] = useState<'loading' | 'guest' | 'signed_in'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
      } catch {
        setAuthGate('guest');
        router.replace('/login');
      }
    })();
  }, [router]);

  async function handleBackup() {
    setBusy('backup');
    try {
      await downloadBackupWorkbook(getSupabaseClient());
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(null);
    }
  }

  function openUploadPicker() {
    uploadInputRef.current?.click();
  }

  function handleTemplate() {
    downloadTemplateWorkbook();
    toast.success('Template downloaded');
  }

  async function handleUpload(file: File) {
    setBusy('upload');
    setResult(null);
    try {
      const wb = await parseWorkbook(file);
      const summary = await uploadWorkbook(getSupabaseClient(), wb);
      const msg = `Upload summary: ${summary.added} added, ${summary.skipped} skipped, ${summary.errors.length} errors.`;
      setResult(msg);
      toast.success(msg);
      if (summary.errors.length > 0) {
        console.error('Workbook upload errors', summary.errors);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
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
        description="Unified data center: one Excel backup, one template, one upload flow."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Consolidated Excel (backup, template &amp; bulk upload)</CardTitle>
          <CardDescription>
            One workbook format for everything: full backup of your data, an empty multi-tab template to fill in, or upload to append rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void handleBackup()}
          >
            <span>{busy === 'backup' ? 'Downloading…' : 'Download full backup (.xlsx)'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={handleTemplate}
          >
            <span>Download consolidated template (.xlsx)</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            className="sr-only"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-hidden
            tabIndex={-1}
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={openUploadPicker}
          >
            <span>{busy === 'upload' ? 'Uploading…' : 'Bulk upload workbook'}</span>
            <Upload className="h-4 w-4" />
          </Button>
          {busy === 'upload' ? (
            <p className="text-sm text-muted-foreground">
              <Upload className="mr-1 inline h-4 w-4" aria-hidden />
              Upload in progress…
            </p>
          ) : null}
          {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
