'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MAIN_NAV_ITEMS, isMainNavActive } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Fixed bar — tap targets ≥ 44px; V1 shows four items only. */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.1)] backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <div className="flex h-[var(--mobile-nav-height)] items-stretch gap-0 px-1 pt-1">
        {MAIN_NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isMainNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                  active ? 'bg-primary/12 text-primary shadow-inner' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-[1.2rem] w-[1.2rem] shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
              </span>
              <span className="max-w-full truncate px-0.5 text-center leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
