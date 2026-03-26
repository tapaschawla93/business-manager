'use client';

import * as React from 'react';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FabProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'size'> & {
  'aria-label'?: string;
};

/** Primary FAB — matches reference (grid / apps icon). */
export function Fab({ className, 'aria-label': ariaLabel, ...props }: FabProps) {
  return (
    <Button
      type="button"
      size="icon"
      className={cn(
        'fixed bottom-[calc(var(--mobile-nav-height)+var(--fab-gap))] right-4 z-40 h-14 w-14 rounded-full border border-primary/20 shadow-lg shadow-primary/20 md:bottom-6 md:right-6',
        className,
      )}
      aria-label={ariaLabel ?? 'Quick menu'}
      {...props}
    >
      <LayoutGrid className="h-6 w-6" strokeWidth={2} />
    </Button>
  );
}
