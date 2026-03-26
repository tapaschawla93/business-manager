'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchSalesList } from '@/lib/queries/salesList';
import type { SaleListRow } from '@/lib/queries/salesList';
import { formatInrDisplay } from '@/lib/formatInr';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Fab } from '@/components/Fab';
import { SalesForm } from './components/SalesForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function SalesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<SaleListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    setLoading(true);
    const { data, error } = await fetchSalesList(supabase);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }

      const { data: profile, error } = await supabase.from('profiles').select('business_id').single();

      if (error || !profile?.business_id) {
        router.replace('/');
        return;
      }

      setReady(true);
    }

    void init();
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  function exportCsvAction() {
    if (!rows?.length) {
      toast.message('No sales to export yet.');
      return;
    }
    const headers = [
      'order_ref',
      'date',
      'product',
      'category',
      'quantity',
      'customer',
      'amount',
      'status',
    ];
    const csvRows = rows.map((r) => ({
      order_ref: orderLabel(r.sale.id),
      date: r.sale.date,
      product: r.lineSummary.primaryProduct,
      category: r.lineSummary.primaryCategory,
      quantity: r.lineSummary.totalQty,
      customer: r.sale.customer_name,
      amount: r.sale.total_amount,
      status: r.sale.payment_mode === 'online' ? 'Online' : 'Cash',
    }));
    downloadCsv('sales_records.csv', rowsToCsv(headers, csvRows));
    toast.success('Exported sales_records.csv');
  }

  if (!ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Records"
        description="Track all your customer orders and revenue."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-border/80 font-semibold"
              onClick={exportCsvAction}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button type="button" className="h-11 gap-2 rounded-xl font-semibold shadow-sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New Sale
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden border-border/80 shadow-md">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className="ui-table-head py-4">Order #</TableHead>
                  <TableHead className="ui-table-head py-4">Date</TableHead>
                  <TableHead className="ui-table-head py-4">Product</TableHead>
                  <TableHead className="ui-table-head py-4">Category</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Qty</TableHead>
                  <TableHead className="ui-table-head py-4">Customer</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Amount</TableHead>
                  <TableHead className="ui-table-head py-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading sales…
                    </TableCell>
                  </TableRow>
                ) : !rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <p className="text-sm font-semibold text-foreground">No sales yet</p>
                        <p className="text-sm text-muted-foreground">Record your first sale with New Sale.</p>
                        <Button type="button" className="mt-2 rounded-xl font-semibold" onClick={() => setDialogOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" aria-hidden />
                          New Sale
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.sale.id} className="border-border/50">
                      <TableCell className="font-mono text-xs font-semibold text-foreground">{orderLabel(r.sale.id)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateShort(r.sale.date)}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm font-medium text-foreground">
                        {r.lineSummary.primaryProduct}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-md text-[10px] font-bold uppercase tracking-wide">
                          {r.lineSummary.primaryCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.lineSummary.totalQty}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm">{r.sale.customer_name}</TableCell>
                      <TableCell className="text-right text-sm font-bold tabular-nums">
                        {formatInrDisplay(Number(r.sale.total_amount))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.sale.payment_mode === 'online'
                              ? 'border-primary/25 bg-primary/5 font-semibold text-primary'
                              : 'font-semibold'
                          }
                        >
                          {r.sale.payment_mode === 'online' ? 'Online' : 'Cash'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Fab aria-label="Quick actions" onClick={() => setDialogOpen(true)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(92vh,800px)] gap-6 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Sale</DialogTitle>
            <DialogDescription>Enter customer, lines, and payment. Totals are confirmed on save.</DialogDescription>
          </DialogHeader>
          <SalesForm
            compact
            onSaved={() => {
              setDialogOpen(false);
              void load();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
