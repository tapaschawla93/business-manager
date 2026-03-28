'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { SaleListLineDetail, SaleListRow } from '@/lib/queries/salesList';
import { formatInrDisplay } from '@/lib/formatInr';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function orderLabel(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ORD-${compact}`;
}

function lineLabel(name: string, variant: string | null): string {
  if (!variant || variant.trim() === '') return name;
  return `${name} — ${variant}`;
}

function profitToneClass(value: number): string {
  if (!Number.isFinite(value)) return 'text-muted-foreground';
  if (value > 0) return 'text-finance-positive';
  if (value < 0) return 'text-finance-negative';
  return 'text-muted-foreground';
}

function LineBlock({ line }: { line: SaleListLineDetail }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2 text-xs">
      <p className="font-semibold text-foreground">{lineLabel(line.product_name, line.variant)}</p>
      <p className="text-[11px] text-muted-foreground">{line.category}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Qty</dt>
          <dd className="font-medium tabular-nums">{line.quantity}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sale price</dt>
          <dd className="font-medium tabular-nums">{formatInrDisplay(line.sale_price)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="font-medium tabular-nums">{formatInrDisplay(line.cost_price_snapshot)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">MRP</dt>
          <dd className="font-medium tabular-nums">{formatInrDisplay(line.mrp_snapshot)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">vs MRP</dt>
          <dd className={cn('font-medium tabular-nums', profitToneClass(-line.vs_mrp))}>
            {formatInrDisplay(line.vs_mrp)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profit</dt>
          <dd className={cn('font-semibold tabular-nums', profitToneClass(line.profit))}>
            {formatInrDisplay(line.profit)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

type Props = {
  rows: SaleListRow[] | null;
  loading: boolean;
  onNewSale: () => void;
};

/** `prd.v2.mobile-polish`: accordion list below `md`; desktop uses `<Table>`. */
export function SalesMobileList({ rows, loading, onNewSale }: Props) {
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        Loading sales…
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-16 text-center">
        <p className="text-sm font-semibold text-foreground">No sales yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Record your first sale with New Sale.</p>
        <Button type="button" className="mt-4 rounded-xl font-semibold" onClick={onNewSale}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New Sale
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-0.5">
      {rows.map((r) => {
        const open = openSaleId === r.sale.id;
        const customer = r.sale.customer_name?.trim() || '—';

        const salePanelId = `sale-${r.sale.id}-detail`;

        return (
          <div
            key={r.sale.id}
            className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm"
          >
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-1 px-2 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-expanded={open}
              aria-controls={salePanelId}
              onClick={() => setOpenSaleId(open ? null : r.sale.id)}
            >
              <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                {orderLabel(r.sale.id)}
              </span>
              <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                ·
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{customer}</span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                {formatInrDisplay(Number(r.sale.total_amount))}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 px-1.5 py-0 text-[10px] font-semibold capitalize',
                  r.sale.payment_mode === 'online'
                    ? 'border-primary/25 bg-primary/5 text-primary'
                    : '',
                )}
              >
                {r.sale.payment_mode === 'online' ? 'Online' : 'Cash'}
              </Badge>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
                  open && 'rotate-180',
                )}
                aria-hidden
              />
            </button>

            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
              aria-hidden={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  id={salePanelId}
                  role="region"
                  className="space-y-3 border-t border-border/50 bg-muted/40 px-3 pb-4 pt-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatDateShort(r.sale.date)}
                  </p>
                  {(r.sale.customer_phone || r.sale.customer_address || r.sale.sale_type) && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {r.sale.customer_phone ? <p>Phone: {r.sale.customer_phone}</p> : null}
                      {r.sale.customer_address ? <p className="line-clamp-3">Address: {r.sale.customer_address}</p> : null}
                      {r.sale.sale_type ? <p>Type: {r.sale.sale_type}</p> : null}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs">
                    <span className="text-muted-foreground">Sale profit</span>
                    <span className={cn('font-bold tabular-nums', profitToneClass(Number(r.sale.total_profit)))}>
                      {formatInrDisplay(Number(r.sale.total_profit))}
                    </span>
                  </div>
                  {r.lines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No line items.</p>
                  ) : (
                    <div className="space-y-2">
                      {r.lines.map((line) => (
                        <LineBlock key={line.id} line={line} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
