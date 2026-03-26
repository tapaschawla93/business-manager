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
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden"
      aria-label="Main navigation"
    >
      <div className="flex h-[var(--mobile-nav-height)] items-stretch gap-0.5 overflow-x-auto px-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MAIN_NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isMainNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-11 min-w-[4.25rem] shrink-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-w-[4.5rem] sm:text-[10px]',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full sm:h-11 sm:w-11',
                  active ? 'bg-accent text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5" strokeWidth={active ? 2.25 : 2} aria-hidden />
              </span>
              <span className="max-w-[4.25rem] truncate text-center leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
