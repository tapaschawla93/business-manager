'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { devError } from '@/lib/devLog';
import { MAIN_NAV_ITEMS, isMainNavActive } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

function ShellNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {MAIN_NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = isMainNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  /** Resolve business name for the sidebar header (profile -> business). */
  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || cancelled) return;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profileError) {
        devError('AppShell profile business id', profileError);
        toast.error(profileError.message || 'Could not load business name');
        return;
      }
      const businessId = (profile?.business_id as string | undefined) ?? null;
      if (!businessId) {
        setBusinessName(null);
        return;
      }

      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle();
      if (cancelled) return;
      if (businessError) {
        devError('AppShell business name', businessError);
        toast.error(businessError.message || 'Could not load business name');
        return;
      }
      const name = (business?.name as string | undefined)?.trim() ?? '';
      setBusinessName(name || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    setMobileNavOpen(false);
    const supabase = getSupabaseClient();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* still navigate */
    }
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
    } else {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <aside
        className="fixed left-0 top-0 z-20 hidden h-screen w-[var(--sidebar-width)] flex-col border-r border-border/70 bg-card shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] md:flex"
        aria-label="Sidebar"
      >
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
            <TrendingUp className="h-5 w-5" aria-hidden strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <span
              className="block truncate text-lg font-bold tracking-tight text-foreground"
              title={businessName ?? 'My Business'}
            >
              {businessName ?? 'My Business'}
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-4" aria-label="Main">
          <ShellNavLinks pathname={pathname} />
        </nav>

        <div className="mt-auto space-y-2 border-t border-border/70 p-4">
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full justify-start font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            Logout
          </Button>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
              {email ? initialsFromEmail(email) : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground" title={email ?? undefined}>
                {email ?? '…'}
              </p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen md:pl-[var(--sidebar-width)]">
        <div className="mx-auto max-w-7xl px-[var(--main-padding-x)] pb-[var(--main-bottom-mobile)] py-6 md:px-[var(--main-padding-x-md)] md:pb-[var(--main-bottom-desktop)] md:py-8">
          {pathname === '/' ? (
            children
          ) : (
            <div className="rounded-card border border-border/60 bg-card/85 p-4 shadow-sm sm:p-6 md:p-8">
              {children}
            </div>
          )}
        </div>
      </main>

      {/* Mobile: slide-over nav (replaces bottom bar); FAB toggles open/close */}
      <Button
        type="button"
        size="icon"
        className="fixed bottom-[var(--menu-fab-bottom-mobile)] right-4 z-[60] h-14 w-14 rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-lg shadow-primary/25 md:hidden"
        aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-shell-nav"
        onClick={() => setMobileNavOpen((o) => !o)}
      >
        {mobileNavOpen ? <X className="h-6 w-6" strokeWidth={2} aria-hidden /> : <Menu className="h-6 w-6" strokeWidth={2} aria-hidden />}
      </Button>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          id="mobile-shell-nav"
          className="flex w-[min(100vw-1rem,var(--sidebar-width))] max-w-[var(--sidebar-width)] flex-col gap-0 border-r bg-card p-0 sm:max-w-[var(--sidebar-width)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Main menu</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3 border-b border-border/70 px-5 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
              <TrendingUp className="h-5 w-5" aria-hidden strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <span
                className="block truncate text-lg font-bold tracking-tight text-foreground"
                title={businessName ?? 'My Business'}
              >
                {businessName ?? 'My Business'}
              </span>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4" aria-label="Main">
            <ShellNavLinks pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </nav>
          <div className="mt-auto space-y-2 border-t border-border/70 p-4">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full justify-start font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Logout
            </Button>
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                {email ? initialsFromEmail(email) : '—'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground" title={email ?? undefined}>
                  {email ?? '…'}
                </p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
