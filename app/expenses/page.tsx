'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchActiveExpenses } from '@/lib/queries/expenses';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Expense } from '@/lib/types/expense';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { Button } from '@/components/ui/button';
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
import { Fab } from '@/components/Fab';
import { Download, Plus } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { PageHeader } from '@/components/PageHeader';

export default function ExpensesPage() {
  const router = useRouter();
  const [sessionOk, setSessionOk] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!businessId) return;
    const supabase = getSupabaseClient();
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchActiveExpenses(supabase, {
      businessId,
    });
    setLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setExpenses(data ?? []);
  }, [businessId]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      setSessionOk(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_id')
        .single();

      if (profileError || !profile?.business_id) {
        setError(profileError?.message ?? 'No business profile');
        setCheckingSession(false);
        return;
      }

      setBusinessId(profile.business_id);
      setCheckingSession(false);
    }

    void init();
  }, [router]);

  useEffect(() => {
    if (!businessId) return;
    void loadExpenses();
  }, [businessId, loadExpenses]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(row: Expense) {
    setEditing(row);
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditing(null);
  }

  function requestArchive(id: string) {
    setArchiveTargetId(id);
  }

  async function confirmArchive() {
    const id = archiveTargetId;
    if (!businessId || !id) return;
    setArchiveTargetId(null);

    const supabase = getSupabaseClient();
    setError(null);
    const { error: upErr } = await supabase.rpc('archive_expense', {
      p_expense_id: id,
    });

    if (upErr) {
      setError(upErr.message);
      toast.error(upErr.message);
      return;
    }
    toast.success('Expense archived');
    if (editing?.id === id) setEditing(null);
    await loadExpenses();
  }

  if (checkingSession || !sessionOk) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!businessId) {
    return error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Manage purchases and operating costs. Total is quantity × unit cost."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-border/80 font-semibold"
              onClick={() => {
                if (!expenses.length) {
                  toast.message('No expenses to export.');
                  return;
                }
                const headers = ['date', 'vendor', 'item', 'quantity', 'unit_cost', 'total', 'payment'];
                const csvRows = expenses.map((e) => ({
                  date: e.date,
                  vendor: e.vendor_name,
                  item: e.item_description,
                  quantity: e.quantity,
                  unit_cost: e.unit_cost ?? '',
                  total: e.total_amount,
                  payment: e.payment_mode,
                }));
                downloadCsv('expenses.csv', rowsToCsv(headers, csvRows));
                toast.success('Exported expenses.csv');
              }}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button type="button" className="h-11 gap-2 rounded-xl font-semibold shadow-sm" onClick={openNew}>
              <Plus className="h-4 w-4" aria-hidden />
              New expense
            </Button>
          </>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ExpenseList
        expenses={expenses}
        loading={loading}
        onEdit={(row) => openEdit(row)}
        onArchive={requestArchive}
        onRefresh={() => void loadExpenses()}
      />

      <Fab aria-label="New expense" onClick={openNew} />

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit expense' : 'Add New Purchase'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this record, then save.' : 'Record vendor, items, and payment.'}
            </DialogDescription>
          </DialogHeader>
          <ExpenseForm
            businessId={businessId}
            editing={editing}
            onDiscardEdit={() => {
              setEditing(null);
              setDialogOpen(false);
            }}
            onSaved={async () => {
              await loadExpenses();
              setDialogOpen(false);
              setEditing(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveTargetId !== null} onOpenChange={(o) => !o && setArchiveTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive expense?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from lists and exports. This cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmArchive()}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
