'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Building2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { MAIN_NAV_ITEMS, isMainNavActive } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <aside
        className="fixed left-0 top-0 z-20 hidden h-screen w-[var(--sidebar-width)] flex-col border-r border-border bg-card shadow-sm md:flex"
        aria-label="Sidebar"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">BizManager</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {MAIN_NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isMainNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active
                    ? 'bg-accent text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border p-3">
          <Button
            type="button"
            variant="ghost"
            className="mb-2 h-10 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            Logout
          </Button>
          <div className="flex items-center gap-3 rounded-card bg-muted/50 px-3 py-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {email ? initialsFromEmail(email) : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground" title={email ?? undefined}>
                {email ?? '…'}
              </p>
              <p className="text-xs text-muted-foreground">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen md:pl-[var(--sidebar-width)]">
        <div className="mx-auto max-w-7xl px-[var(--main-padding-x)] pb-[var(--main-bottom-mobile)] py-6 md:px-[var(--main-padding-x-md)] md:pb-[var(--main-bottom-desktop)] md:py-6">
          {children}
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
