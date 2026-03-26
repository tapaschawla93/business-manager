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
        description="Record purchases and operating costs. Total is quantity × unit cost."
        actions={
          <Button type="button" onClick={openNew}>
            New expense
          </Button>
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
            <DialogTitle>{editing ? 'Edit expense' : 'New expense'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this record, then save.' : 'Enter vendor, item, and amounts.'}
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
