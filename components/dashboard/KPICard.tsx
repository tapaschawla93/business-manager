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
  footer,
  valueClassName,
  iconClassName,
  trendLabel,
  trendVariant = 'positive',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  /** Extra content below the hint (e.g. secondary KPI lines). */
  footer?: ReactNode;
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
      <CardContent className="relative p-3.5 md:p-5">
        <div className="flex items-start justify-between gap-1.5 md:gap-2">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground md:h-11 md:w-11 md:rounded-xl [&_svg]:h-4 [&_svg]:w-4 md:[&_svg]:h-5 md:[&_svg]:w-5',
              iconClassName,
            )}
          >
            {icon}
          </div>
          {trendLabel ? (
            <Badge
              variant="outline"
              className={cn(
                'gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold shadow-none md:px-2 md:py-0.5 md:text-xs',
                pillClass,
              )}
            >
              {trendVariant === 'positive' ? <TrendingUp className="h-2.5 w-2.5 md:h-3 md:w-3" aria-hidden /> : null}
              {trendLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2.5 text-xs font-medium text-muted-foreground md:mt-4 md:text-sm">{label}</p>
        <p
          className={cn(
            'mt-0.5 text-lg font-bold tabular-nums tracking-tight text-foreground md:mt-1 md:text-2xl',
            valueClassName,
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground md:mt-1 md:text-xs">{hint}</p>
        ) : null}
        {footer ? <div className="mt-2 space-y-0.5 border-t border-border/50 pt-2">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
