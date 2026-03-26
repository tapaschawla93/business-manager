'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Login stays minimal (no sidebar / bottom nav). All other routes use the SaaS shell.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <>
      {isLogin ? (
        <div className="min-h-screen bg-background">{children}</div>
      ) : (
        <AppShell>{children}</AppShell>
      )}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
