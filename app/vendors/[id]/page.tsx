'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { archiveVendor, fetchVendorById } from '@/lib/queries/vendors';
import { fetchActiveExpenses } from '@/lib/queries/expenses';
import type { Vendor } from '@/lib/types/vendor';
import type { Expense } from '@/lib/types/expense';
import { formatInrDisplay } from '@/lib/formatInr';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { toast } from 'sonner';

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
  const [authRedirect, setAuthRedirect] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setAuthRedirect(true);
        router.replace('/login');
        return;
      }

      const [vRes, eRes] = await Promise.all([fetchVendorById(supabase, id), fetchActiveExpenses(supabase)]);

      if (vRes.error || !vRes.data) {
        setError(vRes.error?.message ?? 'Vendor not found');
        setVendor(null);
        setExpenses([]);
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
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  async function confirmArchive() {
    if (!id) return;
    setArchiving(true);
    const supabase = getSupabaseClient();
    const { error } = await archiveVendor(supabase, id);
    setArchiving(false);
    setArchiveOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Vendor deleted');
    router.replace('/vendors');
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return null;
  }

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (authRedirect) {
    return <SessionRedirectNotice to="login" />;
  }

  if (error || !vendor) {
    return (
      <div className="space-y-6 rounded-card border border-border/60 bg-card/80 p-6 shadow-sm">
        <p className="text-sm text-destructive">{error ?? 'Vendor not found'}</p>
        <Button type="button" variant="outline" asChild>
          <Link href="/vendors">Back to vendors</Link>
        </Button>
      </div>
    );
  }

  const totalSpent = expenses.reduce((s, e) => s + Number(e.total_amount), 0);

  return (
    <div className="space-y-8">
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => setArchiveOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Contact person</p>
            <p className="mt-1 text-sm font-medium">{vendor.contact_person ?? '—'}</p>
          </CardContent>
        </Card>
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
        <Card className="sm:col-span-2 lg:col-span-3">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Address</p>
            <p className="mt-1 text-sm font-medium">{vendor.address ?? '—'}</p>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                    <TableHead className="ui-table-head py-3">Date</TableHead>
                    <TableHead className="ui-table-head py-3">Item</TableHead>
                    <TableHead className="ui-table-head py-3 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((row) => (
                    <TableRow key={row.id} className="border-border/50">
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateShort(row.date)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm font-medium">{row.item_description}</TableCell>
                      <TableCell className="text-right text-sm font-bold tabular-nums">
                        {formatInrDisplay(Number(row.total_amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete vendor</DialogTitle>
            <DialogDescription>
              Permanently removes this vendor. Expenses keep their data; the vendor link is cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiving}
              onClick={() => void confirmArchive()}
            >
              {archiving ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
