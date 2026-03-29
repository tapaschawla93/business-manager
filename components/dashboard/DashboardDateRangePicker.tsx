'use client';

import { useEffect, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function parseYmdLocal(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, 12, 0, 0, 0);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function DashboardDateRangePicker({
  baseline,
  open,
  onApply,
  onDismiss,
  className,
}: {
  baseline: { from: string; to: string };
  open: boolean;
  onApply: (r: { from: string; to: string }) => void;
  onDismiss: () => void;
  className?: string;
}) {
  const [selected, setSelected] = useState<DateRange | undefined>(() => {
    const from = parseYmdLocal(baseline.from);
    const to = parseYmdLocal(baseline.to);
    if (!from || !to) return undefined;
    return { from, to };
  });

  useEffect(() => {
    if (!open) return;
    const from = parseYmdLocal(baseline.from);
    const to = parseYmdLocal(baseline.to);
    setSelected(from && to ? { from, to } : undefined);
  }, [open, baseline.from, baseline.to]);

  function handleApply() {
    if (!selected?.from || !selected.to) {
      return;
    }
    const from = toYmd(selected.from);
    const to = toYmd(selected.to);
    if (compareYmd(from, to) > 0) {
      return;
    }
    onApply({ from, to });
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex justify-center [&_.rdp-root]:mx-auto">
        <DayPicker
          mode="range"
          selected={selected}
          onSelect={setSelected}
          numberOfMonths={1}
          className="rounded-xl border border-border/60 bg-card p-2 shadow-sm"
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {selected?.from && selected.to ? (
          <>
            {format(selected.from, 'dd MMM yyyy')} — {format(selected.to, 'dd MMM yyyy')}
          </>
        ) : (
          <>Select a start date, then an end date.</>
        )}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onDismiss}>
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 rounded-xl font-semibold"
          disabled={!selected?.from || !selected.to}
          onClick={handleApply}
        >
          Apply range
        </Button>
      </div>
    </div>
  );
}
