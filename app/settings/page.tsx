'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Export active tenant data only (deleted_at IS NULL). Client-side CSV; no server.
 */
export default function SettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else setReady(true);
    });
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
      'item_description',
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

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Export your business data as CSV (active records only).</p>
      </div>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Export data</CardTitle>
          <CardDescription>Each button downloads one file. Exports respect row-level security.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between rounded-[10px] px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportProducts()}
          >
            <span>{busy === 'products' ? 'Exporting…' : 'Products CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between rounded-[10px] px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportSales()}
          >
            <span>{busy === 'sales' ? 'Exporting…' : 'Sales CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between rounded-[10px] px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportSaleItems()}
          >
            <span>{busy === 'sale_items' ? 'Exporting…' : 'Sale items CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-between rounded-[10px] px-4 font-medium"
            disabled={busy !== null}
            onClick={() => void exportExpenses()}
          >
            <span>{busy === 'expenses' ? 'Exporting…' : 'Expenses CSV'}</span>
            <Download className="h-4 w-4 text-primary" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
