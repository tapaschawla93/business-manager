'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type LineDraft = {
  localId: string;
  productId: string | null;
  label: string;
  categoryPreview: string | null;
  quantity: string;
  salePrice: string;
  /** Preview only — server recomputes from DB at save */
  mrpPreview: number | null;
  costPreview: number | null;
  /** From inventory table; optional hint only */
  stockOnHand: number | null;
};

/**
 * One sale line: qty + sale_price; shows profit & vs MRP preview from cached product values.
 */
export function ProductLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  onChange: (next: LineDraft) => void;
  onRemove: () => void;
}) {
  const qty = Number(line.quantity);
  const price = Number(line.salePrice);
  const mrp = line.mrpPreview;
  const cost = line.costPreview;

  const previewVsMrp =
    mrp != null && Number.isFinite(price) ? round2(price - mrp) : null;
  const previewProfit =
    cost != null && Number.isFinite(price) && Number.isFinite(qty) && qty > 0
      ? round2((price - cost) * qty)
      : null;

  return (
    <Card className={cn('bg-muted/30 shadow-none')}>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-sm">
            <div className="truncate font-semibold text-foreground">
              {line.productId ? line.label : 'Pick a product'}
            </div>
            {line.productId && line.categoryPreview ? (
              <div className="mt-0.5 text-xs font-medium text-primary/90">{line.categoryPreview}</div>
            ) : null}
            {line.productId && mrp != null && cost != null && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                MRP {formatInrDisplay(mrp)} · Cost {formatInrDisplay(cost)} (preview)
                {line.stockOnHand != null && Number.isFinite(line.stockOnHand) ? (
                  <span className="block text-foreground/80">
                    In stock: {line.stockOnHand} units
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive" onClick={onRemove}>
            Remove
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Qty</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={line.quantity}
              onChange={(e) => onChange({ ...line, quantity: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Selling price</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={line.salePrice}
              onChange={(e) => onChange({ ...line, salePrice: e.target.value })}
            />
          </div>
        </div>
        {line.productId && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              vs MRP: {previewVsMrp == null ? '—' : formatInrDisplay(previewVsMrp)}
            </span>
            <span className="font-medium text-primary">
              Line profit: {previewProfit == null ? '—' : formatInrDisplay(previewProfit)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
