'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FabProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'size'> & {
  'aria-label'?: string;
};

/** Primary FAB — bottom offset uses layout tokens (mobile nav + gap). */
export function Fab({ className, 'aria-label': ariaLabel, ...props }: FabProps) {
  return (
    <Button
      type="button"
      size="icon"
      className={cn(
        'fixed bottom-[calc(var(--mobile-nav-height)+var(--fab-gap))] right-4 z-40 h-14 w-14 rounded-full shadow-lg md:bottom-6 md:right-6',
        className,
      )}
      aria-label={ariaLabel ?? 'Add'}
      {...props}
    >
      <Plus className="h-7 w-7" strokeWidth={2.25} />
    </Button>
  );
}
