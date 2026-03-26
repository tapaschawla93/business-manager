'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MAIN_NAV_ITEMS, isMainNavActive } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Fixed bar height = var(--mobile-nav-height). Tap targets ≥ 44px on icon stack. */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex h-[var(--mobile-nav-height)] items-stretch justify-around border-t border-border bg-card px-1 pt-1 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden"
      aria-label="Main navigation"
    >
      {MAIN_NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = isMainNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full',
                active ? 'bg-accent text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
            </span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
