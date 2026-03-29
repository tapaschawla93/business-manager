'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { Expense } from '@/lib/types/expense';
import { formatInrDisplay } from '@/lib/formatInr';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  onArchive: (id: string) => void;
};

export function ExpenseMobileList({ expenses, onArchive }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2 px-0.5 pb-2 pt-1">
      {expenses.map((row) => {
        const open = openId === row.id;
        const panelId = `expense-${row.id}-detail`;
        return (
          <div
            key={row.id}
            className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm"
          >
            <div className="flex min-h-11 items-stretch">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                {row.update_inventory === true ? (
                  <Badge variant="secondary" className="ml-1 shrink-0 px-1.5 py-0 text-[10px] font-bold uppercase">
                    Stock
                  </Badge>
                ) : null}
                <MobileAccordionChevron open={open} className="h-4 w-4 shrink-0" />
              </button>
              <div className="flex shrink-0 items-stretch border-l border-border/40">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-auto min-h-11 w-9 shrink-0 rounded-none"
                      aria-label="Row actions"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={() => onArchive(row.id)}
                    >
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">{row.vendor_name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{row.category?.trim() ? row.category : '—'}</p>
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
                <p className="text-[11px] text-muted-foreground">
                  Editing or archiving here does not change stock — adjust inventory on the Inventory page if needed.
                </p>
              </div>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
