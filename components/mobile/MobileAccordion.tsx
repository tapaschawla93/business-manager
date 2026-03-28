'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Chevron for expandable list rows (mobile accordions). */
export function MobileAccordionChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDown
      className={cn(
        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
        open && 'rotate-180',
        className,
      )}
      aria-hidden
    />
  );
}

/**
 * Animated expand region — same pattern as SalesMobileList (`grid-template-rows` + reduced motion).
 */
export function MobileAccordionBody({
  open,
  children,
  className,
  /** When set, parent row button should use `aria-controls={contentId}`. */
  contentId,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  contentId?: string;
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          id={contentId}
          role={contentId ? 'region' : undefined}
          className={cn(
            'border-t border-border/50 bg-muted/40 px-3 pb-3 pt-2 text-xs leading-snug',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
