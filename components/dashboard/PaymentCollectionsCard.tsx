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
      <CardHeader className="pb-2">
        <CardTitle className="ui-section-title">Collections by payment mode</CardTitle>
        <p className="text-xs font-normal text-muted-foreground">
          Cash in hand (period): split how sales were collected — not net of expenses.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
          <span className="text-sm text-muted-foreground">Total collected (sales)</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{formatInrDisplay(total)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Banknote className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cash</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{formatInrDisplay(cashCollected)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Smartphone className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Online</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{formatInrDisplay(onlineCollected)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
