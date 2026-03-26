'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchVendorById } from '@/lib/queries/vendors';
import { fetchActiveExpenses } from '@/lib/queries/expenses';
import type { Vendor } from '@/lib/types/vendor';
import type { Expense } from '@/lib/types/expense';
import { formatInrDisplay } from '@/lib/formatInr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const supabase = getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace('/login');
      return;
    }

    setLoading(true);
    setError(null);

    const [vRes, eRes] = await Promise.all([fetchVendorById(supabase, id), fetchActiveExpenses(supabase)]);

    if (vRes.error || !vRes.data) {
      setError(vRes.error?.message ?? 'Vendor not found');
      setVendor(null);
      setExpenses([]);
      setLoading(false);
      return;
    }

    setVendor(vRes.data);
    const vname = vRes.data.name;
    const all = eRes.data ?? [];
    const linked = all.filter(
      (e) => e.vendor_id === id || (!e.vendor_id && e.vendor_name.trim().toLowerCase() === vname.trim().toLowerCase()),
    );
    linked.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(linked);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return null;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (error || !vendor) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error ?? 'Vendor not found'}</p>
        <Button type="button" variant="outline" asChild>
          <Link href="/vendors">Back to vendors</Link>
        </Button>
      </div>
    );
  }

  const totalSpent = expenses.reduce((s, e) => s + Number(e.total_amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button type="button" variant="ghost" size="sm" className="mb-2 -ml-2 h-8 gap-1 text-muted-foreground" asChild>
            <Link href="/vendors">
              <ArrowLeft className="h-4 w-4" />
              Vendors
            </Link>
          </Button>
          <h1 className="ui-page-title">{vendor.name}</h1>
          <p className="mt-1 ui-page-description">Vendor profile and recorded expenses.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Phone</p>
            <p className="mt-1 text-sm font-medium">{vendor.phone ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="mt-1 text-sm font-medium break-all">{vendor.email ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total purchases (visible expenses)</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{formatInrDisplay(totalSpent)}</p>
          </CardContent>
        </Card>
      </div>

      {vendor.notes ? (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="ui-section-title">Notes</h2>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">{vendor.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <h2 className="ui-section-title">Expenses</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses for this vendor yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateShort(row.date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{row.item_description}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatInrDisplay(Number(row.total_amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
