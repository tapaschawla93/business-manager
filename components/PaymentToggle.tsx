'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
        <Button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          variant={value === m ? 'default' : 'outline'}
          className={cn('h-10 flex-1 justify-center', value === m ? 'shadow-sm' : 'bg-background')}
        >
          {m === 'cash' ? 'Cash' : 'Online'}
        </Button>
      ))}
    </div>
  );
}
