'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { CustomerListRow } from '@/lib/types/customer';
import { formatInrDisplay } from '@/lib/formatInr';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';

type Props = {
  rows: CustomerListRow[];
  onOpen: (row: CustomerListRow) => void;
  onEdit: (row: CustomerListRow) => void;
  onDelete: (row: CustomerListRow) => void;
  onCreate: (row: CustomerListRow) => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

export function CustomersMobileList({ rows, onOpen, onEdit, onDelete, onCreate }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2 px-0.5 pb-2 pt-1">
      {rows.map((row) => {
        const open = openId === row.id;
        const panelId = `customer-${row.id}-detail`;
        return (
          <div key={row.id} className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm">
            <div className="flex min-h-11 items-stretch">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : row.id)}
              >
                <div className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  <span className="font-semibold text-foreground">{row.name}</span>
                  <span className="text-muted-foreground"> · {row.phone?.trim() || '-'}</span>
                  <span className="text-muted-foreground"> · {row.orderCount} orders</span>
                </div>
                <MobileAccordionChevron open={open} className="h-4 w-4 shrink-0 self-center" />
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
                    <DropdownMenuItem onSelect={() => onOpen(row)}>View</DropdownMenuItem>
                    <DropdownMenuItem disabled={!row.customerId} onSelect={() => onEdit(row)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!!row.customerId} onSelect={() => onCreate(row)}>
                      Create Record
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!row.customerId}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={() => onDelete(row)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Total spent</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatInrDisplay(row.totalSpent)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Last order</p>
                  <p className="font-medium text-foreground">{formatDate(row.lastOrderDate)}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpen(row)}>
                  View order history
                </Button>
              </div>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
