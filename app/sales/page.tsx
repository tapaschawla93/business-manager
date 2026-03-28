'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchSalesList } from '@/lib/queries/salesList';
import type { SaleListRow } from '@/lib/queries/salesList';
import { formatInrDisplay } from '@/lib/formatInr';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import {
  buildImportIssuesCsv,
  getNullableString,
  getRequiredNumber,
  getString,
  normalizeDateYmd,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
import {
  buildProductLookupMap,
  PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE,
  resolveProductLookup,
  type ProductLookupResolution,
} from '@/lib/productLookupMap';
import { devError } from '@/lib/devLog';
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
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';

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
  const session = useBusinessSession({ onMissingBusiness: 'redirect-home' });
  const ready = session.kind === 'ready';
  const [rows, setRows] = useState<SaleListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);

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
    if (!ready) return;
    void load();
  }, [ready, load]);

  function downloadSalesTemplate() {
    const headers = [
      'sale_ref',
      'date',
      'customer_name',
      'customer_phone',
      'customer_address',
      'sale_type',
      'payment_mode',
      'notes',
      'product_lookup',
      'quantity',
      'sale_price',
    ];
    const rowsTemplate = [
      {
        sale_ref: 'S1',
        date: '2026-03-27',
        customer_name: 'John',
        customer_phone: '',
        customer_address: '',
        sale_type: 'B2C',
        payment_mode: 'cash',
        notes: '',
        product_lookup: 'Sample Product A',
        quantity: '2',
        sale_price: '1500',
      },
    ];
    downloadCsv('template_sales.csv', rowsToCsv(headers, rowsTemplate));
  }

  async function importSalesFile(file: File) {
    setImporting(true);
    try {
    const supabase = getSupabaseClient();
    const text = await file.text();
    const { rows: csvRows } = parseCsv(text);
    const issues: ImportIssue[] = [];

    const { data: productRows, error: pErr } = await supabase
      .from('products')
      .select('id, name, variant')
      .is('deleted_at', null);
    if (pErr) {
      toast.error(pErr.message);
      return;
    }

    const lookupIndex = buildProductLookupMap(
      (productRows ?? []) as { id: string; name: string; variant: string | null }[],
    );

    type Group = {
      rowNos: number[];
      date: string;
      customerName: string | null;
      customerPhone: string | null;
      customerAddress: string | null;
      saleType: 'B2C' | 'B2B' | 'B2B2C' | null;
      paymentMode: 'cash' | 'online';
      notes: string | null;
      lines: { product_id: string; quantity: number; sale_price: number }[];
    };

    const groups = new Map<string, Group>();
    csvRows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const ref = getString(r, 'sale_ref');
      const dateRaw = getString(r, 'date');
      const date = normalizeDateYmd(dateRaw);
      const paymentMode = getString(r, 'payment_mode').toLowerCase();
      const saleTypeRaw = getString(r, 'sale_type').toUpperCase();
      const lookupStr = getString(r, 'product_lookup');
      const resolved: ProductLookupResolution = lookupStr
        ? resolveProductLookup(lookupIndex, lookupStr)
        : { productId: null, ambiguous: false };
      const productId = resolved.productId;
      const qty = getRequiredNumber(r, 'quantity');
      const salePrice = getRequiredNumber(r, 'sale_price');

      if (!ref) issues.push({ row: rowNo, field: 'sale_ref', message: 'required' });
      if (!date) issues.push({ row: rowNo, field: 'date', message: 'invalid date (use YYYY-MM-DD or DD/MM/YYYY)' });
      if (paymentMode !== 'cash' && paymentMode !== 'online') {
        issues.push({ row: rowNo, field: 'payment_mode', message: "must be 'cash' or 'online'" });
      }
      if (saleTypeRaw !== '' && !['B2C', 'B2B', 'B2B2C'].includes(saleTypeRaw)) {
        issues.push({ row: rowNo, field: 'sale_type', message: 'must be B2C/B2B/B2B2C' });
      }
      if (qty === null || qty <= 0) issues.push({ row: rowNo, field: 'quantity', message: 'must be > 0' });
      if (salePrice === null || salePrice < 0) issues.push({ row: rowNo, field: 'sale_price', message: 'must be >= 0' });
      if (resolved.ambiguous) {
        issues.push({ row: rowNo, field: 'product_lookup', message: PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE });
      } else if (!productId) {
        issues.push({ row: rowNo, field: 'product_lookup', message: 'no matching product' });
      }

      if (!ref || !date || (paymentMode !== 'cash' && paymentMode !== 'online') || qty === null || qty <= 0 || salePrice === null || salePrice < 0 || !productId) {
        return;
      }

      const existing = groups.get(ref);
      const saleType = saleTypeRaw === '' ? null : (saleTypeRaw as 'B2C' | 'B2B' | 'B2B2C');
      const draft: Group = existing ?? {
        rowNos: [],
        date,
        customerName: getNullableString(r, 'customer_name'),
        customerPhone: getNullableString(r, 'customer_phone'),
        customerAddress: getNullableString(r, 'customer_address'),
        saleType,
        paymentMode: paymentMode as 'cash' | 'online',
        notes: getNullableString(r, 'notes'),
        lines: [],
      };

      if (existing) {
        if (existing.date !== date) issues.push({ row: rowNo, field: 'date', message: 'inconsistent in sale_ref' });
        if (existing.paymentMode !== paymentMode) issues.push({ row: rowNo, field: 'payment_mode', message: 'inconsistent in sale_ref' });
      }

      draft.rowNos.push(rowNo);
      draft.lines.push({ product_id: productId, quantity: qty, sale_price: salePrice });
      groups.set(ref, draft);
    });

    let inserted = 0;
    for (const [ref, group] of groups.entries()) {
      if (issues.some((i) => group.rowNos.includes(i.row))) continue;
      const { error } = await supabase.rpc('save_sale', {
        p_date: group.date,
        p_customer_name: group.customerName,
        p_customer_phone: group.customerPhone,
        p_customer_address: group.customerAddress,
        p_sale_type: group.saleType,
        p_payment_mode: group.paymentMode,
        p_notes: group.notes,
        p_lines: group.lines,
      });
      if (error) {
        issues.push({ row: group.rowNos[0], field: 'sale_ref', message: `${ref}: ${error.message}` });
      } else {
        inserted += 1;
      }
    }

    if (issues.length > 0) downloadCsv('sales_import_errors.csv', buildImportIssuesCsv(issues));
    toast.success(`Sales import complete: ${inserted} inserted, ${issues.length} failed rows.`);
    await load();
    } catch (e) {
      devError('sales import', e);
      toast.error(e instanceof Error ? e.message : 'Sales import failed');
    } finally {
      setImporting(false);
    }
  }

  if (session.kind === 'loading') {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );
  }

  if (session.kind === 'redirect_login') {
    return <SessionRedirectNotice to="login" />;
  }

  if (session.kind === 'redirect_home') {
    return <SessionRedirectNotice to="home" />;
  }

  if (session.kind === 'error') {
    return <p className="text-sm text-destructive">{session.message}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sales Records"
        description="Track all your customer orders and revenue."
        actions={
          <>
            <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={downloadSalesTemplate}>
              <Download className="h-4 w-4" aria-hidden />
              Template
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl"
              onClick={() => document.getElementById('sales-upload-input')?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {importing ? 'Uploading…' : 'Bulk Upload'}
            </Button>
            <input
              id="sales-upload-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void importSalesFile(file);
                e.currentTarget.value = '';
              }}
            />
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
                  <TableHead className="ui-table-head py-4">Phone</TableHead>
                  <TableHead className="ui-table-head py-4">Address</TableHead>
                  <TableHead className="ui-table-head py-4">Sale type</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Amount</TableHead>
                  <TableHead className="ui-table-head py-4">Mode of payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                      Loading sales…
                    </TableCell>
                  </TableRow>
                ) : !rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-16">
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
                      <TableCell className="max-w-[140px] truncate text-sm">{r.sale.customer_name ?? '—'}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm">{r.sale.customer_phone ?? '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{r.sale.customer_address ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.sale.sale_type ?? '—'}</TableCell>
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
