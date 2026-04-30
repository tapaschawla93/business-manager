'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { SalesForm } from './components/SalesForm';
import { SalesMobileList } from './components/SalesMobileList';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { archiveSaleWithClientFallback } from '@/lib/archiveSale';
import { fetchDefaultSaleTagId } from '@/lib/queries/saleTags';
import { ModuleCsvMenu } from '@/components/ModuleCsvMenu';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

function getStringByAliases(row: Record<string, string>, aliases: string[]): string {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v] as const);
  for (const alias of aliases) {
    const target = normalizeHeaderKey(alias);
    const hit = normalizedEntries.find(([k]) => k === target);
    if (hit) return String(hit[1] ?? '').trim();
  }
  return '';
}

function parseCsvNumberFlexible(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizePaymentMode(raw: string): 'cash' | 'online' | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (v === 'cash' || v === 'offline') return 'cash';
  if (v === 'online' || v === 'upi' || v === 'card' || v === 'netbanking') return 'online';
  return null;
}

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
  const compact = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `ORD-${compact}`;
}

export default function SalesPage() {
  const session = useBusinessSession({ onMissingBusiness: 'redirect-home' });
  const ready = session.kind === 'ready';
  const [rows, setRows] = useState<SaleListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleListRow | null>(null);
  const [archiveSaleId, setArchiveSaleId] = useState<string | null>(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
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

  useEffect(() => {
    if (!rows) return;
    const current = new Set(rows.map((r) => r.sale.id));
    setSelectedSaleIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (current.has(id)) next.add(id);
      return next;
    });
  }, [rows]);

  function openNewSaleDialog() {
    setEditingSale(null);
    setDialogOpen(true);
  }

  async function confirmArchiveSale() {
    const id = archiveSaleId;
    if (!id || session.kind !== 'ready') return;
    setArchiveSaleId(null);
    const supabase = getSupabaseClient();
    const { error, usedClientFallback } = await archiveSaleWithClientFallback(supabase, {
      saleId: id,
      businessId: session.businessId,
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      usedClientFallback
        ? 'Sale removed (dev-only fallback without archive_sale RPC — use migrations in production).'
        : 'Sale removed',
    );
    void load();
  }

  async function confirmBulkArchiveSales() {
    if (session.kind !== 'ready' || selectedSaleIds.size === 0) return;
    setBulkDeleteOpen(false);
    const ids = Array.from(selectedSaleIds);
    const supabase = getSupabaseClient();
    let deleted = 0;
    let failed = 0;
    for (const saleId of ids) {
      const { error } = await archiveSaleWithClientFallback(supabase, {
        saleId,
        businessId: session.businessId,
      });
      if (error) failed += 1;
      else deleted += 1;
    }
    setSelectedSaleIds(new Set());
    if (failed > 0) {
      toast.error(`Deleted ${deleted} sale(s), ${failed} failed.`);
    } else {
      toast.success(`Deleted ${deleted} sale(s).`);
    }
    void load();
  }

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
      'tag',
      'product_lookup',
      'variant',
      'quantity',
      'total_amount',
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
        tag: 'General',
        product_lookup: 'Sample Product A',
        variant: '',
        quantity: '2',
        total_amount: '3000',
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

    const [{ data: productRows, error: pErr }, { data: tagRows, error: tagErr }, { data: defaultTagId, error: defErr }] =
      await Promise.all([
        supabase.from('products').select('id, name, variant').is('deleted_at', null),
        supabase.from('sale_tags').select('id, label').is('deleted_at', null).order('label'),
        fetchDefaultSaleTagId(supabase),
      ]);
    if (pErr) {
      toast.error(pErr.message);
      return;
    }
    if (tagErr || defErr) {
      toast.error(tagErr?.message ?? defErr?.message ?? 'Could not load tags');
      return;
    }
    const productRowsTyped = (productRows ?? []) as { id: string; name: string; variant: string | null }[];
    const productIds = new Set(productRowsTyped.map((p) => p.id));

    const tagList = (tagRows ?? []) as { id: string; label: string }[];
    function resolveImportTag(raw: string): string | null {
      const s = raw.trim();
      if (!s) return defaultTagId ?? null;
      if (tagList.some((t) => t.id === s)) return s;
      const lower = s.toLowerCase();
      const hit = tagList.find((t) => t.label.trim().toLowerCase() === lower);
      return hit?.id ?? null;
    }

    const lookupIndex = buildProductLookupMap(productRowsTyped);

    type Group = {
      rowNos: number[];
      date: string;
      customerName: string | null;
      customerPhone: string | null;
      customerAddress: string | null;
      saleType: 'B2C' | 'B2B' | 'B2B2C' | null;
      paymentMode: 'cash' | 'online';
      notes: string | null;
      saleTagId: string;
      lines: { product_id: string; quantity: number; sale_price: number }[];
    };

    const groups = new Map<string, Group>();
    csvRows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const ref = getString(r, 'sale_ref');
      const dateRaw = getString(r, 'date');
      const date = normalizeDateYmd(dateRaw);
      const paymentMode = normalizePaymentMode(getStringByAliases(r, ['payment_mode', 'payment mode']));
      const saleTypeRaw = getString(r, 'sale_type').toUpperCase();
      const tagRaw = getString(r, 'tag');
      const resolvedTagId = resolveImportTag(tagRaw);
      const lookupStr = getStringByAliases(r, ['product_lookup', 'product_name', 'product']);
      const variantStr = getStringByAliases(r, ['variant', 'product_variant']);
      const lookupWithVariant =
        lookupStr && variantStr && !lookupStr.includes('::') ? `${lookupStr}::${variantStr}` : lookupStr;
      const productIdRaw = getStringByAliases(r, ['product_id']);
      const resolvedVariantFirst: ProductLookupResolution =
        lookupStr && variantStr
          ? resolveProductLookup(lookupIndex, `${lookupStr}::${variantStr}`)
          : { productId: null, ambiguous: false };
      const resolvedGeneral: ProductLookupResolution =
        lookupStr || variantStr ? resolveProductLookup(lookupIndex, lookupWithVariant) : { productId: null, ambiguous: false };
      const productId =
        productIdRaw && UUID_RE.test(productIdRaw) && productIds.has(productIdRaw)
          ? productIdRaw
          : resolvedVariantFirst.productId ?? resolvedGeneral.productId;
      const qty = parseCsvNumberFlexible(getStringByAliases(r, ['quantity', 'qty']));
      const totalAmount =
        getRequiredNumber(r, 'total_amount') ??
        getRequiredNumber(r, 'sale_amount') ??
        getRequiredNumber(r, 'line_total') ??
        getRequiredNumber(r, 'sale_price');
      // CSV import uses line totals; convert to unit price for RPC storage.
      const effectiveTotalAmount = totalAmount;
      const effectiveUnitPrice =
        qty !== null && qty > 0 && effectiveTotalAmount !== null ? effectiveTotalAmount / qty : null;

      if (!ref) issues.push({ row: rowNo, field: 'sale_ref', message: 'required' });
      if (!date) issues.push({ row: rowNo, field: 'date', message: 'invalid date (use YYYY-MM-DD or DD/MM/YYYY)' });
      if (paymentMode === null) {
        issues.push({ row: rowNo, field: 'payment_mode', message: "must be 'cash' or 'online'" });
      }
      if (saleTypeRaw !== '' && !['B2C', 'B2B', 'B2B2C'].includes(saleTypeRaw)) {
        issues.push({ row: rowNo, field: 'sale_type', message: 'must be B2C/B2B/B2B2C' });
      }
      if (qty === null || qty <= 0) issues.push({ row: rowNo, field: 'quantity', message: 'must be > 0' });
      if (effectiveTotalAmount === null || effectiveTotalAmount < 0) {
        issues.push({
          row: rowNo,
          field: 'total_amount',
          message: 'must be >= 0 (or provide sale_price for unit price format)',
        });
      }
      if (resolvedVariantFirst.ambiguous || resolvedGeneral.ambiguous) {
        issues.push({ row: rowNo, field: 'product_lookup', message: PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE });
      } else if (!productId) {
        issues.push({ row: rowNo, field: 'product_lookup', message: 'no matching product' });
      }
      if (!resolvedTagId) {
        issues.push({
          row: rowNo,
          field: 'tag',
          message: 'unknown tag (use label or uuid, or leave empty if business has a default)',
        });
      }

      if (
        !ref ||
        !date ||
        paymentMode === null ||
        qty === null ||
        qty <= 0 ||
        effectiveUnitPrice === null ||
        effectiveUnitPrice < 0 ||
        !productId ||
        !resolvedTagId
      ) {
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
        saleTagId: resolvedTagId,
        lines: [],
      };

      if (existing) {
        if (existing.date !== date) issues.push({ row: rowNo, field: 'date', message: 'inconsistent in sale_ref' });
        if (existing.paymentMode !== paymentMode) issues.push({ row: rowNo, field: 'payment_mode', message: 'inconsistent in sale_ref' });
        if (existing.saleTagId !== resolvedTagId) {
          issues.push({ row: rowNo, field: 'tag', message: 'inconsistent in sale_ref' });
        }
      }

      draft.rowNos.push(rowNo);
      draft.lines.push({ product_id: productId, quantity: qty, sale_price: effectiveUnitPrice });
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
        p_sale_tag_id: group.saleTagId,
        p_skip_stock_check: true,
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

  const visibleSaleIds = (rows ?? []).map((r) => r.sale.id);
  const selectableCount = visibleSaleIds.length;
  const selectedCount = selectedSaleIds.size;
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sales Records"
        description="Track all your customer orders and revenue."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl text-sm font-semibold md:h-11 md:text-base"
              disabled={!ready || selectedCount === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete selected ({selectedCount})
            </Button>
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl text-sm font-semibold shadow-sm md:h-11 md:text-base"
              onClick={openNewSaleDialog}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Sale
            </Button>
            <ModuleCsvMenu
              menuAriaLabel="Sales CSV import"
              busy={importing}
              disabled={!ready}
              onDownloadTemplate={downloadSalesTemplate}
              onFileSelected={(f) => void importSalesFile(f)}
            />
          </>
        }
      />

      <Card className="overflow-hidden border-border/80 shadow-md">
        <CardContent className="p-0">
          <div className="px-0.5 py-3 md:hidden">
            <SalesMobileList
              rows={rows}
              loading={loading}
              onNewSale={openNewSaleDialog}
              onEditSale={(row) => {
                setEditingSale(row);
                setDialogOpen(true);
              }}
              onArchiveSale={(id) => setArchiveSaleId(id)}
            />
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[44px] py-4 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all sales"
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSaleIds(new Set(visibleSaleIds));
                        else setSelectedSaleIds(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead className="ui-table-head py-4">Order #</TableHead>
                  <TableHead className="ui-table-head py-4">Date</TableHead>
                  <TableHead className="ui-table-head py-4">Tag</TableHead>
                  <TableHead className="ui-table-head py-4">Product</TableHead>
                  <TableHead className="ui-table-head py-4">Category</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Qty</TableHead>
                  <TableHead className="ui-table-head py-4">Customer</TableHead>
                  <TableHead className="ui-table-head py-4">Phone</TableHead>
                  <TableHead className="ui-table-head py-4">Address</TableHead>
                  <TableHead className="ui-table-head py-4">Sale type</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Amount</TableHead>
                  <TableHead className="ui-table-head py-4">Mode of payment</TableHead>
                  <TableHead className="ui-table-head w-[100px] py-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-12 text-center text-muted-foreground">
                      Loading sales…
                    </TableCell>
                  </TableRow>
                ) : !rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <p className="text-sm font-semibold text-foreground">No sales yet</p>
                        <p className="text-sm text-muted-foreground">Record your first sale with New Sale.</p>
                        <Button type="button" className="mt-2 rounded-xl font-semibold" onClick={openNewSaleDialog}>
                          <Plus className="mr-2 h-4 w-4" aria-hidden />
                          New Sale
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.sale.id} className="border-border/50">
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select order ${orderLabel(r.sale.id)}`}
                          checked={selectedSaleIds.has(r.sale.id)}
                          onChange={(e) => {
                            setSelectedSaleIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.sale.id);
                              else next.delete(r.sale.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-[10px] font-medium leading-tight text-foreground md:text-[11px]">
                        {orderLabel(r.sale.id)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateShort(r.sale.date)}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate text-sm text-muted-foreground">
                        {r.sale.sale_tag_label ?? '—'}
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            aria-label="Edit sale"
                            onClick={() => {
                              setEditingSale(r);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            aria-label="Delete sale"
                            onClick={() => setArchiveSaleId(r.sale.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSale(null);
        }}
      >
        <DialogContent className="max-h-[min(92vh,800px)] gap-6 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSale ? 'Edit sale' : 'Add New Sale'}</DialogTitle>
            <DialogDescription>
              {editingSale
                ? 'Update lines, customer, or payment. Stock and totals are recalculated on save.'
                : 'Enter customer, lines, and payment. Totals are confirmed on save.'}
            </DialogDescription>
          </DialogHeader>
          <SalesForm
            key={editingSale?.sale.id ?? 'new'}
            compact
            editSale={editingSale}
            onDiscardEdit={() => {
              setDialogOpen(false);
              setEditingSale(null);
            }}
            onSaved={() => {
              setDialogOpen(false);
              setEditingSale(null);
              void load();
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveSaleId !== null} onOpenChange={(o) => !o && setArchiveSaleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              The sale row is permanently deleted. Line quantities are returned to inventory (ledger or BOM components).
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmArchiveSale()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected sales?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCount} selected sale record(s). Line quantities are returned to inventory
              (ledger or BOM components). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmBulkArchiveSales()}
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
