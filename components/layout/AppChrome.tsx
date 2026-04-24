'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/layout/AppShell';
import { MissingSupabaseConfig } from '@/components/MissingSupabaseConfig';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

/**
 * Login stays minimal (no sidebar / bottom nav). All other routes use the SaaS shell.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthStandalone = pathname === '/login' || pathname === '/set-password';

  if (!isSupabaseConfigured()) {
    return (
      <>
        <MissingSupabaseConfig />
        <Toaster position="top-center" richColors closeButton />
      </>
    );
  }

  return (
    <>
      {isAuthStandalone ? (
        <div className="min-h-screen bg-background">{children}</div>
      ) : (
        <AppShell>{children}</AppShell>
      )}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
