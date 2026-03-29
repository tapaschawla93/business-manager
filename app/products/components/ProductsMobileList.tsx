'use client';

import { useState } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import type { Product } from '@/lib/types/product';
import { getProductMargin, productMarginToneClass } from '@/lib/products/productMargin';
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

type Props = {
  products: Product[];
  onEdit: (p: Product) => void;
  onArchive: (id: string) => void;
  onAdd: () => void;
};

/** Collapsed: name · variant · category (badge) in one flow, max two lines. */
export function ProductsMobileList({ products, onEdit, onArchive, onAdd }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-1 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No matching products</p>
        <p className="text-xs text-muted-foreground">Try a different search or add a product.</p>
        <Button
          type="button"
          size="sm"
          className="h-10 gap-2 rounded-xl text-sm md:h-11 md:text-base"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
          Add product
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-0.5 pb-2 pt-1">
      {products.map((p) => {
        const open = openId === p.id;
        const panelId = `product-${p.id}-detail`;
        const m = getProductMargin(p);
        const variantLabel = p.variant?.trim() ? p.variant : '—';
        return (
          <div
            key={p.id}
            className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm"
          >
            <div className="flex min-h-11 items-stretch">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : p.id)}
              >
                <div className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="text-muted-foreground"> · {variantLabel}</span>
                  <span className="text-muted-foreground"> · </span>
                  <Badge
                    variant="secondary"
                    className="align-middle rounded px-1.5 py-0 text-[10px] font-bold uppercase"
                  >
                    {p.category}
                  </Badge>
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
                    <DropdownMenuItem onSelect={() => onEdit(p)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={() => onArchive(p.id)}
                    >
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-[11px] text-muted-foreground">MRP</dt>
                  <dd className="font-semibold tabular-nums">{formatInrDisplay(Number(p.mrp))}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Cost</dt>
                  <dd className="tabular-nums">{formatInrDisplay(Number(p.cost_price))}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Margin</dt>
                  <dd className={cn('font-semibold tabular-nums', productMarginToneClass(m.tone))}>{m.label}</dd>
                </div>
              </dl>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
