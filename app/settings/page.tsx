'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import {
  buildImportIssuesCsv,
  getNullableString,
  getOptionalNumber,
  getRequiredNumber,
  getString,
  normalizeDateTimeIso,
  normalizeDateYmd,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
import { Input } from '@/components/ui/input';
import type { Product } from '@/lib/types/product';
import { importInventoryCsvRows, inventoryImportIssuesCsv } from '@/lib/inventory/importInventoryCsv';
import {
  buildProductLookupMap,
  PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE,
  resolveProductLookup,
  type ProductLookupResolution,
} from '@/lib/productLookupMap';

/**
 * Export active tenant data only (deleted_at IS NULL). Client-side CSV; no server.
 */
export default function SettingsPage() {
  const router = useRouter();
  const [authGate, setAuthGate] = useState<'loading' | 'guest' | 'signed_in'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getUser(),
          25_000,
          'Sign-in check timed out. Check your network, then refresh.',
        );
        if (error || !data.user) {
          router.replace('/login');
          setAuthGate('guest');
          return;
        }
        setAuthGate('signed_in');
      } catch {
        setAuthGate('guest');
        router.replace('/login');
      }
    })();
  }, [router]);

  const exportProducts = useCallback(async () => {
    setBusy('products');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('products').select('*').is('deleted_at', null);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const headers = [
      'id',
      'business_id',
      'name',
      'variant',
      'category',
      'mrp',
      'cost_price',
      'hsn_code',
      'tax_pct',
      'created_at',
      'updated_at',
    ];
    downloadCsv('products.csv', rowsToCsv(headers, rows));
    toast.success('Downloaded products.csv');
  }, []);

  const exportSales = useCallback(async () => {
    setBusy('sales');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('sales').select('*').is('deleted_at', null);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const headers = [
      'id',
      'business_id',
      'date',
      'customer_name',
      'payment_mode',
      'total_amount',
      'total_cost',
      'total_profit',
      'notes',
      'created_at',
      'updated_at',
    ];
    downloadCsv('sales.csv', rowsToCsv(headers, rows));
    toast.success('Downloaded sales.csv');
  }, []);

  const exportSaleItems = useCallback(async () => {
    setBusy('sale_items');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('sale_items').select('*');
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const headers = [
      'id',
      'sale_id',
      'product_id',
      'quantity',
      'sale_price',
      'cost_price_snapshot',
      'mrp_snapshot',
      'vs_mrp',
      'profit',
      'created_at',
      'updated_at',
    ];
    downloadCsv('sale_items.csv', rowsToCsv(headers, rows));
    toast.success('Downloaded sale_items.csv');
  }, []);

  const exportExpenses = useCallback(async () => {
    setBusy('expenses');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('expenses').select('*').is('deleted_at', null);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const headers = [
      'id',
      'business_id',
      'date',
      'vendor_name',
      'vendor_id',
      'item_description',
      'product_id',
      'quantity',
      'unit_cost',
      'total_amount',
      'payment_mode',
      'notes',
      'created_at',
      'updated_at',
    ];
    downloadCsv('expenses.csv', rowsToCsv(headers, rows));
    toast.success('Downloaded expenses.csv');
  }, []);

  function clearImportResult() {
    setImportResult(null);
  }

  function downloadTemplateProducts() {
    const headers = ['name', 'category', 'mrp', 'cost_price', 'hsn_code', 'tax_pct', 'variant'];
    const rows = [
      {
        name: 'Sample Product A',
        category: 'GENERAL',
        mrp: '1500',
        cost_price: '900',
        hsn_code: '',
        tax_pct: '18',
        variant: '',
      },
    ];
    downloadCsv('template_products.csv', rowsToCsv(headers, rows));
  }

  function downloadTemplateExpenses() {
    const headers = ['date', 'vendor_name', 'item_description', 'quantity', 'unit_cost', 'total_amount', 'payment_mode', 'notes'];
    const rows = [
      {
        date: '2026-03-27',
        vendor_name: 'ABC Traders',
        item_description: 'Packaging',
        quantity: '10',
        unit_cost: '25',
        total_amount: '250',
        payment_mode: 'cash',
        notes: '',
      },
    ];
    downloadCsv('template_expenses.csv', rowsToCsv(headers, rows));
  }

  function downloadTemplateSales() {
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
    const rows = [
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
      {
        sale_ref: 'S1',
        date: '2026-03-27',
        customer_name: 'John',
        customer_phone: '',
        customer_address: '',
        sale_type: 'B2C',
        payment_mode: 'cash',
        notes: '',
        product_lookup: 'Sample Product B',
        quantity: '1',
        sale_price: '800',
      },
    ];
    downloadCsv('template_sales.csv', rowsToCsv(headers, rows));
  }

  function downloadTemplateInventory() {
    const headers = ['name', 'unit', 'current_stock', 'unit_cost', 'reorder_level', 'product_lookup', 'add_to_products'];
    const rows = [
      {
        name: 'Grow bags 5kg',
        unit: 'pcs',
        current_stock: '100',
        unit_cost: '12',
        reorder_level: '20',
        product_lookup: '',
        add_to_products: 'false',
      },
    ];
    downloadCsv('template_inventory.csv', rowsToCsv(headers, rows));
  }

  async function readFileText(file: File): Promise<string> {
    return await file.text();
  }

  async function importProducts(file: File) {
    clearImportResult();
    setBusy('import-products');
    const supabase = getSupabaseClient();
    const { data: profile } = await supabase.from('profiles').select('business_id').single();
    const businessId = profile?.business_id as string | undefined;
    if (!businessId) {
      setBusy(null);
      toast.error('No business profile');
      return;
    }

    const text = await readFileText(file);
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];
    const valid: { rowNo: number; payload: Record<string, unknown> }[] = [];

    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const name = getString(r, 'name');
      const category = getString(r, 'category');
      const mrp = getRequiredNumber(r, 'mrp');
      const cost = getRequiredNumber(r, 'cost_price');
      const tax = getOptionalNumber(r, 'tax_pct');

      if (!name) issues.push({ row: rowNo, field: 'name', message: 'required' });
      if (!category) issues.push({ row: rowNo, field: 'category', message: 'required' });
      if (mrp === null || mrp < 0) issues.push({ row: rowNo, field: 'mrp', message: 'must be >= 0 number' });
      if (cost === null || cost < 0) issues.push({ row: rowNo, field: 'cost_price', message: 'must be >= 0 number' });
      if (tax !== null && (tax < 0 || tax > 100)) issues.push({ row: rowNo, field: 'tax_pct', message: 'must be between 0 and 100' });

      if (name && category && mrp !== null && mrp >= 0 && cost !== null && cost >= 0) {
        valid.push({
          rowNo,
          payload: {
          business_id: businessId,
          name,
          category,
          mrp,
          cost_price: cost,
          hsn_code: getNullableString(r, 'hsn_code'),
          tax_pct: tax,
          variant: getNullableString(r, 'variant'),
          },
        });
      }
    });

    let inserted = 0;
    for (const v of valid) {
      const { error } = await supabase.from('products').insert(v.payload);
      if (error) {
        issues.push({ row: v.rowNo, field: 'row', message: error.message });
      } else {
        inserted += 1;
      }
    }

    setBusy(null);
    if (issues.length) {
      downloadCsv('products_import_errors.csv', buildImportIssuesCsv(issues));
    }
    setImportResult(`Products import: inserted ${inserted}, failed ${issues.length}.`);
    toast.success(`Products import complete: ${inserted} inserted.`);
  }

  async function importExpenses(file: File) {
    clearImportResult();
    setBusy('import-expenses');
    const supabase = getSupabaseClient();
    const { data: profile } = await supabase.from('profiles').select('business_id').single();
    const businessId = profile?.business_id as string | undefined;
    if (!businessId) {
      setBusy(null);
      toast.error('No business profile');
      return;
    }

    const text = await readFileText(file);
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];
    const valid: { rowNo: number; payload: Record<string, unknown> }[] = [];

    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const dateRaw = getString(r, 'date');
      const date = normalizeDateTimeIso(dateRaw);
      const vendor = getString(r, 'vendor_name');
      const item = getString(r, 'item_description');
      const qty = getRequiredNumber(r, 'quantity');
      const unitCost = getRequiredNumber(r, 'unit_cost');
      const mode = getString(r, 'payment_mode').toLowerCase();
      const totalRaw = getOptionalNumber(r, 'total_amount');

      if (!date) issues.push({ row: rowNo, field: 'date', message: 'invalid date (use YYYY-MM-DD or DD/MM/YYYY)' });
      if (!vendor) issues.push({ row: rowNo, field: 'vendor_name', message: 'required' });
      if (!item) issues.push({ row: rowNo, field: 'item_description', message: 'required' });
      if (qty === null || qty <= 0) issues.push({ row: rowNo, field: 'quantity', message: 'must be > 0' });
      if (unitCost === null || unitCost < 0) issues.push({ row: rowNo, field: 'unit_cost', message: 'must be >= 0' });
      if (mode !== 'cash' && mode !== 'online') issues.push({ row: rowNo, field: 'payment_mode', message: "must be 'cash' or 'online'" });

      if (date && vendor && item && qty !== null && qty > 0 && unitCost !== null && unitCost >= 0 && (mode === 'cash' || mode === 'online')) {
        valid.push({
          rowNo,
          payload: {
            business_id: businessId,
            date,
            vendor_name: vendor,
            item_description: item,
            quantity: qty,
            unit_cost: unitCost,
            total_amount: totalRaw ?? qty * unitCost,
            payment_mode: mode,
            notes: getNullableString(r, 'notes'),
          },
        });
      }
    });

    let inserted = 0;
    for (const v of valid) {
      const { error } = await supabase.from('expenses').insert(v.payload);
      if (error) {
        issues.push({ row: v.rowNo, field: 'row', message: error.message });
      } else {
        inserted += 1;
      }
    }

    setBusy(null);
    if (issues.length) {
      downloadCsv('expenses_import_errors.csv', buildImportIssuesCsv(issues));
    }
    setImportResult(`Expenses import: inserted ${inserted}, failed ${issues.length}.`);
    toast.success(`Expenses import complete: ${inserted} inserted.`);
  }

  async function importSales(file: File) {
    clearImportResult();
    setBusy('import-sales');
    const supabase = getSupabaseClient();
    const text = await readFileText(file);
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];

    const { data: productRows, error: pErr } = await supabase
      .from('products')
      .select('id, name, variant')
      .is('deleted_at', null);
    if (pErr) {
      setBusy(null);
      toast.error(pErr.message);
      return;
    }

    const products = (productRows ?? []) as Pick<Product, 'id' | 'name' | 'variant'>[];
    const lookupIndex = buildProductLookupMap(products);

    type SaleGroup = {
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

    const groups = new Map<string, SaleGroup>();

    rows.forEach((r, idx) => {
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
      } else if (!lookupStr || !productId) {
        issues.push({ row: rowNo, field: 'product_lookup', message: 'no matching active product' });
      }

      if (
        !ref ||
        !date ||
        (paymentMode !== 'cash' && paymentMode !== 'online') ||
        (saleTypeRaw !== '' && !['B2C', 'B2B', 'B2B2C'].includes(saleTypeRaw)) ||
        qty === null ||
        qty <= 0 ||
        salePrice === null ||
        salePrice < 0 ||
        !productId
      ) {
        return;
      }

      const existing = groups.get(ref);
      const saleType = saleTypeRaw === '' ? null : (saleTypeRaw as 'B2C' | 'B2B' | 'B2B2C');
      const draft = {
        rowNos: existing?.rowNos ?? [],
        date: existing?.date ?? date,
        customerName: existing?.customerName ?? getNullableString(r, 'customer_name'),
        customerPhone: existing?.customerPhone ?? getNullableString(r, 'customer_phone'),
        customerAddress: existing?.customerAddress ?? getNullableString(r, 'customer_address'),
        saleType: existing?.saleType ?? saleType,
        paymentMode: existing?.paymentMode ?? (paymentMode as 'cash' | 'online'),
        notes: existing?.notes ?? getNullableString(r, 'notes'),
        lines: existing?.lines ?? [],
      };

      if (existing) {
        if (existing.date !== date) issues.push({ row: rowNo, field: 'date', message: 'inconsistent date within sale_ref' });
        if (existing.paymentMode !== paymentMode) {
          issues.push({ row: rowNo, field: 'payment_mode', message: 'inconsistent payment_mode within sale_ref' });
        }
      }

      draft.rowNos.push(rowNo);
      draft.lines.push({ product_id: productId, quantity: qty, sale_price: salePrice });
      groups.set(ref, draft);
    });

    let inserted = 0;
    for (const [ref, group] of groups.entries()) {
      const groupHasIssue = issues.some((i) => group.rowNos.includes(i.row));
      if (groupHasIssue) continue;

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

    setBusy(null);
    if (issues.length) {
      downloadCsv('sales_import_errors.csv', buildImportIssuesCsv(issues));
    }
    setImportResult(`Sales import: inserted ${inserted} sales, failed ${issues.length} rows.`);
    toast.success(`Sales import complete: ${inserted} sales inserted.`);
  }

  async function importInventory(file: File) {
    clearImportResult();
    setBusy('import-inventory');
    const supabase = getSupabaseClient();
    const { data: profile } = await supabase.from('profiles').select('business_id').single();
    const businessId = profile?.business_id as string | undefined;
    if (!businessId) {
      setBusy(null);
      toast.error('No business profile');
      return;
    }

    const text = await readFileText(file);
    const { rows } = parseCsv(text);
    const { data: productRows, error: pErr } = await supabase
      .from('products')
      .select('id, name, variant')
      .is('deleted_at', null);
    if (pErr) {
      setBusy(null);
      toast.error(pErr.message);
      return;
    }

    const result = await importInventoryCsvRows(
      supabase,
      businessId,
      rows,
      (productRows ?? []) as Pick<Product, 'id' | 'name' | 'variant'>[],
    );

    setBusy(null);
    if (result.issues.length) {
      downloadCsv('inventory_import_errors.csv', inventoryImportIssuesCsv(result.issues));
    }
    setImportResult(`Inventory import: inserted ${result.inserted}, issues ${result.issues.length}.`);
    toast.success(`Inventory import complete: ${result.inserted} inserted.`);
  }

  if (authGate === 'loading') {
    return <PageLoadingSkeleton />;
  }

  if (authGate === 'guest') {
    return <SessionRedirectNotice to="login" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Settings"
        description="Export data, download templates, and bulk upload by module."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export data</CardTitle>
          <CardDescription>Each button downloads one file. Exports respect row-level security.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportProducts()}
          >
            <span>{busy === 'products' ? 'Exporting…' : 'Products CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportSales()}
          >
            <span>{busy === 'sales' ? 'Exporting…' : 'Sales CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportSaleItems()}
          >
            <span>{busy === 'sale_items' ? 'Exporting…' : 'Sale items CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportExpenses()}
          >
            <span>{busy === 'expenses' ? 'Exporting…' : 'Expenses CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bulk upload</CardTitle>
          <CardDescription>
            Download the template, fill rows, then upload CSV. Valid rows are inserted; invalid rows are exported as error CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Products</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={downloadTemplateProducts}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importProducts(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Expenses</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={downloadTemplateExpenses}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importExpenses(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Sales</p>
            <p className="text-xs text-muted-foreground">
              Use one row per line item and group lines by <code>sale_ref</code>.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={downloadTemplateSales}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importSales(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Inventory</p>
            <p className="text-xs text-muted-foreground">
              Use <code>product_lookup</code> (name or name::variant) or <code>add_to_products</code> /{' '}
              <code>add_to_section</code> true to create a stub product.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={downloadTemplateInventory}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importInventory(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          {busy?.startsWith('import-') ? (
            <p className="text-sm text-muted-foreground">
              <Upload className="mr-1 inline h-4 w-4" />
              Import in progress…
            </p>
          ) : null}
          {importResult ? <p className="text-sm text-muted-foreground">{importResult}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
