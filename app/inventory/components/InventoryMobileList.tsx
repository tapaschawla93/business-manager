'use client';

import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { InventoryItem } from '@/lib/types/inventoryItem';
import type { Product } from '@/lib/types/product';
import { formatInrDisplay } from '@/lib/formatInr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';

function isLowStock(row: InventoryItem): boolean {
  if (row.reorder_level == null) return false;
  return Number(row.current_stock) <= Number(row.reorder_level);
}

type Props = {
  rows: InventoryItem[];
  products: Product[];
  /** Opens the inventory dialog (link product, stub, stock, cost). */
  onEdit: (row: InventoryItem) => void;
};

/**
 * Collapsed: catalog name · variant · category when linked; otherwise line name · — · — plus “Add to catalog”.
 * Expanded: stock, costs, unit, reorder, line name.
 */
export function InventoryMobileList({ rows, products, onEdit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  return (
    <div className="space-y-2 px-2 pb-2 pt-1">
      {rows.map((r) => {
        const open = openId === r.id;
        const panelId = `inv-line-${r.id}-detail`;
        const low = isLowStock(r);
        const val = Number(r.current_stock) * Number(r.unit_cost);
        const linked = r.product_id ? productById.get(r.product_id) : null;

        return (
          <div
            key={r.id}
            className={
              low
                ? 'overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/90 text-xs shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30'
                : 'overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm'
            }
          >
            <div className="flex min-h-11 items-stretch gap-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : r.id)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="line-clamp-2 min-w-0 flex-1 leading-snug">
                    {linked ? (
                      <>
                        <span className="font-semibold text-foreground">{linked.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {linked.variant?.trim() ? linked.variant : '—'}
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <Badge
                          variant="secondary"
                          className="align-middle rounded px-1.5 py-0 text-[10px] font-bold uppercase"
                        >
                          {linked.category}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">{r.name}</span>
                        <span className="text-muted-foreground"> · — · —</span>
                      </>
                    )}
                  </div>
                  {!linked ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px] font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(r);
                      }}
                    >
                      Add to catalog
                    </Button>
                  ) : null}
                </div>
                <MobileAccordionChevron open={open} className="h-4 w-4 shrink-0 self-center" />
              </button>
              <div className="flex shrink-0 items-center border-l border-border/40 px-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Edit"
                  onClick={() => onEdit(r)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground">On hand</dt>
                  <dd className="font-semibold tabular-nums">{r.current_stock}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground">Unit cost</dt>
                  <dd className="tabular-nums">{formatInrDisplay(Number(r.unit_cost))}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground">Value</dt>
                  <dd className="font-semibold tabular-nums">{formatInrDisplay(val)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground">Unit</dt>
                  <dd className="font-medium">{r.unit}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground">Reorder</dt>
                  <dd className="tabular-nums">{r.reorder_level ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Stock line name</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{r.name}</dd>
                </div>
              </dl>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
