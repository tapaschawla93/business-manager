'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Expense } from '@/lib/types/expense';
import { formatInrDisplay } from '@/lib/formatInr';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';

/** Short date for dense single-line mobile rows (matches other lists’ ~11px meta). */
function formatDateCompact(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  expenses: Expense[];
  onEdit: (row: Expense) => void;
  onArchive: (id: string) => void;
};

export function ExpenseMobileList({ expenses, onEdit, onArchive }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2 px-2 pb-2 pt-1">
      {expenses.map((row) => {
        const open = openId === row.id;
        const panelId = `expense-${row.id}-detail`;
        return (
          <div
            key={row.id}
            className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm"
          >
            <div className="flex min-h-11 items-stretch gap-0">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 px-2 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : row.id)}
              >
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatDateCompact(row.date)}
                </span>
                <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.item_description}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{row.quantity}</span>
                <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                  ·
                </span>
                <span className="shrink-0 font-bold tabular-nums text-foreground">
                  {formatInrDisplay(Number(row.total_amount))}
                </span>
                <MobileAccordionChevron open={open} className="h-4 w-4 shrink-0" />
              </button>
              <div className="flex shrink-0 flex-row items-center gap-0 border-l border-border/40 px-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(row);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Archive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(row.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">{row.vendor_name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Payment</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      'mt-0.5 font-semibold',
                      row.payment_mode === 'online'
                        ? 'border-primary/25 bg-primary/5 text-primary'
                        : '',
                    )}
                  >
                    {row.payment_mode}
                  </Badge>
                </div>
              </div>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
