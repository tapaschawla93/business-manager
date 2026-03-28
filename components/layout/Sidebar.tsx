'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/products', label: 'Products', Icon: Package },
  { href: '/sales', label: 'Sales', Icon: ShoppingCart },
  { href: '/expenses', label: 'Expenses', Icon: ArrowDownCircle },
  { href: '/vendors', label: 'Vendors', Icon: Truck },
  { href: '/inventory', label: 'Inventory', Icon: Warehouse },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  const activeHref = useMemo(() => {
    // Simple exact/prefix matching for this component.
    const match = NAV_ITEMS.find((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
    return match?.href ?? '/';
  }, [pathname]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data: { session } }) => setEmail(session?.user?.email ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email ?? null));
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside
      className="fixed left-0 top-0 hidden h-screen w-[240px] flex-col bg-white md:flex"
      style={{ borderRightWidth: '0.5px' }}
      aria-label="Sidebar"
    >
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#16a34a] text-white" aria-hidden>
          <div className="h-4 w-4 rounded-sm bg-white/20" />
        </div>
        <span className="text-lg font-bold tracking-tight text-[#16a34a]">BizManager</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'bg-green-50 text-[#16a34a]' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pb-4 pt-3">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#16a34a]/15 text-sm font-semibold text-[#16a34a]">
            {email ? initialsFromEmail(email) : '—'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={email ?? undefined}>
              {email ?? '…'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void handleLogout()}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Logout
        </Button>
      </div>
    </aside>
  );
}

