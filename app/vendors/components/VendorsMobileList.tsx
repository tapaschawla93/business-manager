'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreVertical } from 'lucide-react';
import type { Vendor } from '@/lib/types/vendor';
import { Button } from '@/components/ui/button';
import { MobileAccordionBody, MobileAccordionChevron } from '@/components/mobile/MobileAccordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  vendors: Vendor[];
  onArchive: (id: string) => void;
};

/** Collapsed summary: name · contact · address in one flow, wraps to at most two lines (`line-clamp-2`). */
export function VendorsMobileList({ vendors, onArchive }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-2 px-2 pb-2 pt-1">
      {vendors.map((v) => {
        const open = openId === v.id;
        const panelId = `vendor-${v.id}-detail`;
        const contact = v.contact_person?.trim() ? v.contact_person : '—';
        const address = v.address?.trim() ? v.address : '—';
        return (
          <div key={v.id} className="overflow-hidden rounded-lg border border-border/60 bg-card text-xs shadow-sm">
            <div className="flex min-h-11 items-stretch">
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
                    <DropdownMenuItem onSelect={() => router.push(`/vendors/${v.id}`)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={() => onArchive(v.id)}
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
