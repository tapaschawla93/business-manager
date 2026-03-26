'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KPICard({
  icon,
  label,
  value,
  hint,
  valueClassName,
  iconClassName,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  /** Use design tokens, e.g. text-finance-positive / text-finance-negative */
  valueClassName?: string;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
              iconClassName,
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-xl font-bold tracking-tight text-foreground', valueClassName)}>
              {value}
            </p>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
