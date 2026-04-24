'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import type { DashboardDateRange } from '@/lib/queries/dashboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { cn } from '@/lib/utils';

function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function formatRangeLabel(r: DashboardDateRange): string {
  const a = parseYmdLocal(r.from);
  const b = parseYmdLocal(r.to);
  if (!a || !b) return `${r.from} → ${r.to}`;
  return `${format(a, 'dd MMM yyyy')} — ${format(b, 'dd MMM yyyy')}`;
}

/**
 * Dashboard period control: formatted range + YTD shortcut; opens a range picker in Sheet (mobile) or Dialog (desktop).
 */
export function DashboardDateRangeControl({
  appliedRange,
  onApply,
  onYtd,
  disabled,
  className,
  endSlot,
}: {
  appliedRange: DashboardDateRange | null;
  onApply: (r: DashboardDateRange) => void;
  onYtd: () => void;
  disabled?: boolean;
  className?: string;
  /** Renders inside the period card: below date/YTD on small screens, same row on `md+`. */
  endSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [useDialog, setUseDialog] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setUseDialog(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const baseline = appliedRange ?? { from: '', to: '' };

  function handleApply(r: { from: string; to: string }) {
    onApply(r);
    setOpen(false);
  }

  const picker = (
    <DashboardDateRangePicker
      open={open}
      baseline={baseline.from && baseline.to ? baseline : { from: '2000-01-01', to: '2000-01-01' }}
      onApply={handleApply}
      onDismiss={() => setOpen(false)}
    />
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-3 rounded-card border border-border/70 bg-card/40 p-3 shadow-sm md:flex-row md:flex-wrap md:items-end md:gap-4 md:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 md:min-w-0 md:flex-1 md:gap-4">
          <button
            type="button"
            disabled={disabled || !appliedRange}
            onClick={() => setOpen(true)}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-2 text-left text-sm font-medium shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:min-w-[220px] sm:flex-1 md:min-h-11 md:text-base',
            )}
          >
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">
              {appliedRange ? formatRangeLabel(appliedRange) : 'Select period'}
            </span>
          </button>
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full shrink-0 rounded-xl text-sm font-semibold sm:w-auto md:h-11 md:text-base"
            disabled={disabled}
            onClick={onYtd}
          >
            Year to date
          </Button>
        </div>
        {endSlot ? <div className="min-w-0 w-full shrink-0 md:w-[min(100%,220px)]">{endSlot}</div> : null}
      </div>
      {appliedRange ? (
        <p className="text-xs text-muted-foreground md:text-sm">
          Showing:{' '}
          <span className="font-medium text-foreground">
            {appliedRange.from} → {appliedRange.to}
          </span>
        </p>
      ) : null}

      {useDialog ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Dashboard period</DialogTitle>
              <DialogDescription>Choose the first and last day to include (inclusive).</DialogDescription>
            </DialogHeader>
            {picker}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Dashboard period</SheetTitle>
            </SheetHeader>
            <p className="pb-2 text-sm text-muted-foreground">Choose the first and last day to include (inclusive).</p>
            {picker}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
