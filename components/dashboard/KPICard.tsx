'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KPICard({
  icon,
  label,
  value,
  hint,
  valueClassName,
  iconClassName,
  trendLabel,
  trendVariant = 'positive',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
  iconClassName?: string;
  /** e.g. "+12.5%", "Stock", "Live" — matches reference dashboard pills */
  trendLabel?: string;
  trendVariant?: 'positive' | 'neutral' | 'muted';
}) {
  const pillClass =
    trendVariant === 'positive'
      ? 'border-primary/15 bg-primary/10 text-primary'
      : trendVariant === 'neutral'
        ? 'border-border bg-muted/60 text-foreground'
        : 'border-transparent bg-muted text-muted-foreground';

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground',
              iconClassName,
            )}
          >
            {icon}
          </div>
          {trendLabel ? (
            <Badge
              variant="outline"
              className={cn('gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold shadow-none', pillClass)}
            >
              {trendVariant === 'positive' ? <TrendingUp className="h-3 w-3" aria-hidden /> : null}
              {trendLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-4 text-sm font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground', valueClassName)}>
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
