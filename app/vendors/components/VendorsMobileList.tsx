'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import type { Vendor } from '@/lib/types/vendor';
import { Button } from '@/components/ui/button';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';

type Props = {
  vendors: Vendor[];
  onArchive: (id: string) => void;
};

/** Collapsed summary: name · contact · address in one flow, wraps to at most two lines (`line-clamp-2`). */
export function VendorsMobileList({ vendors, onArchive }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2 px-2 pb-2 pt-1">
      {vendors.map((v) => {
        const open = openId === v.id;
        const panelId = `vendor-${v.id}-detail`;
        const contact = v.contact_person?.trim() ? v.contact_person : '—';
        const address = v.address?.trim() ? v.address : '—';
        return (
          <div key={v.id} className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm">
            <div className="flex min-h-11 items-stretch gap-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : v.id)}
              >
                <div className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  <Link
                    href={`/vendors/${v.id}`}
                    className="font-semibold text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {v.name}
                  </Link>
                  <span className="text-muted-foreground"> · {contact}</span>
                  <span className="text-muted-foreground"> · {address}</span>
                </div>
                <MobileAccordionChevron open={open} className="h-4 w-4 shrink-0 self-center" />
              </button>
              <div className="flex shrink-0 items-center border-l border-border/40 px-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Archive vendor"
                  onClick={() => onArchive(v.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <MobileAccordionBody open={open} contentId={panelId}>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Phone</p>
                  <p className="break-all font-medium text-foreground">{v.phone?.trim() ? v.phone : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Email</p>
                  <p className="break-all text-foreground">{v.email?.trim() ? v.email : '—'}</p>
                </div>
              </div>
            </MobileAccordionBody>
          </div>
        );
      })}
    </div>
  );
}
