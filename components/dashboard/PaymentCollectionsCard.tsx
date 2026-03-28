'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Banknote, Smartphone } from 'lucide-react';

/**
 * Period collections split: cash tender vs online/UPI/card, matching `sales.payment_mode`.
 * Sum equals period revenue when every sale uses one of those modes.
 */
export function PaymentCollectionsCard({
  cashCollected,
  onlineCollected,
}: {
  cashCollected: number;
  onlineCollected: number;
}) {
  const total = cashCollected + onlineCollected;

  return (
    <Card>
      <CardHeader className="space-y-1 p-4 pb-2 md:space-y-1.5 md:p-6">
        <CardTitle className="ui-section-title text-sm md:text-base">Collections by payment mode</CardTitle>
        <p className="text-[11px] font-normal leading-snug text-muted-foreground md:text-xs">
          Cash in hand (period): split how sales were collected — not net of expenses.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 md:space-y-4 md:px-6 md:pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2.5 md:pb-3">
          <span className="text-xs text-muted-foreground md:text-sm">Total collected (sales)</span>
          <span className="text-base font-bold tabular-nums text-foreground md:text-lg">{formatInrDisplay(total)}</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 md:gap-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 p-3 md:gap-3 md:rounded-xl md:p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground md:h-10 md:w-10">
              <Banknote className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">Cash</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums md:text-xl">{formatInrDisplay(cashCollected)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 p-3 md:gap-3 md:rounded-xl md:p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary md:h-10 md:w-10">
              <Smartphone className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">Online</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums md:text-xl">{formatInrDisplay(onlineCollected)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
