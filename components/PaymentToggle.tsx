'use client';

import { cn } from '@/lib/utils';

type PaymentMode = 'cash' | 'online';

/**
 * Segmented control — height matches `Input` (h-10) and uses primary/outline tokens.
 */
export function PaymentToggle({
  value,
  onChange,
}: {
  value: PaymentMode;
  onChange: (m: PaymentMode) => void;
}) {
  return (
    <div className="flex gap-2">
      {(['cash', 'online'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'flex h-10 min-h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === m
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'border border-input bg-background text-foreground hover:bg-muted',
          )}
        >
          {m === 'cash' ? 'Cash' : 'Online'}
        </button>
      ))}
    </div>
  );
}
