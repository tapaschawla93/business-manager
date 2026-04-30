'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Plus } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import {
  buildImportIssuesCsv,
  getOptionalNumber,
  getRequiredNumber,
  getString,
  normalizeDateTimeIso,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
import { PageHeader } from '@/components/PageHeader';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { fetchDefaultSaleTagId } from '@/lib/queries/saleTags';
import { ModuleCsvMenu } from '@/components/ModuleCsvMenu';
import { devError } from '@/lib/devLog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { keyExpenses } from '@/lib/excel/dedupeRules';

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

export default function ExpensesPage() {
  const session = useBusinessSession({ onMissingBusiness: 'error' });
  const businessId = session.kind === 'ready' ? session.businessId : null;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Expense | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState<'all' | string>('all');
  const [reverseInventoryOnDelete, setReverseInventoryOnDelete] = useState(false);
  const [importing, setImporting] = useState(false);

  function sameSet(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

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

  const availableYears = Array.from(
    new Set(
      expenses
        .map((e) => {
          const d = new Date(e.date);
          return Number.isFinite(d.getTime()) ? String(d.getFullYear()) : null;
        })
        .filter((y): y is string => !!y),
    ),
  ).sort((a, b) => Number(b) - Number(a));

  const filteredExpenses = expenses.filter((e) => {
    if (yearFilter === 'all') return true;
    const d = new Date(e.date);
    if (!Number.isFinite(d.getTime())) return false;
    return String(d.getFullYear()) === yearFilter;
  });

  useEffect(() => {
    const visible = new Set(filteredExpenses.map((e) => e.id));
    setSelectedExpenseIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return sameSet(prev, next) ? prev : next;
    });
  }, [filteredExpenses]);

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

  function requestArchive(row: Expense) {
    setArchiveTarget(row);
    setReverseInventoryOnDelete(false);
  }

  async function confirmArchive() {
    const target = archiveTarget;
    const id = target?.id ?? null;
    if (!businessId || !id) return;
    setArchiveTarget(null);

    const supabase = getSupabaseClient();
    setError(null);
    const { error: upErr } = await supabase.rpc('archive_expense', {
      p_expense_id: id,
      p_reverse_inventory: reverseInventoryOnDelete,
    });

    if (upErr) {
      setError(upErr.message);
      toast.error(upErr.message);
      return;
    }
    toast.success('Expense deleted');
    if (editing?.id === id) setEditing(null);
    await loadExpenses();
  }

  async function confirmBulkDeleteExpenses() {
    if (!businessId || selectedExpenseIds.size === 0) return;
    setBulkDeleteOpen(false);
    const supabase = getSupabaseClient();
    let deleted = 0;
    let failed = 0;
    for (const id of selectedExpenseIds) {
      const { error: upErr } = await supabase.rpc('archive_expense', {
        p_expense_id: id,
        p_reverse_inventory: false,
      });
      if (upErr) failed += 1;
      else deleted += 1;
    }
    setSelectedExpenseIds(new Set());
    if (failed > 0) toast.error(`Deleted ${deleted} expense(s), ${failed} failed.`);
    else toast.success(`Deleted ${deleted} expense(s).`);
    await loadExpenses();
  }

  function downloadExpensesTemplate() {
    const headers = [
      'date',
      'vendor_name',
      'item_description',
      'quantity',
      'unit_cost',
      'total_amount',
      'payment_mode',
      'notes',
      'category',
      'expense_tag',
    ];
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
        category: '',
        expense_tag: 'General',
      },
    ];
    downloadCsv('template_expenses.csv', rowsToCsv(headers, rows));
  }

  async function importExpensesFile(file: File) {
    if (!businessId) return;
    setImporting(true);
    try {
    const text = await file.text();
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];
    const valid: { rowNo: number; payload: Record<string, unknown> }[] = [];
    const skippedRows: Array<{ row: number; reason: string }> = [];

    const supabase = getSupabaseClient();
    const [{ data: tagRows, error: tagErr }, { data: defaultTagId, error: defErr }] = await Promise.all([
      supabase.from('sale_tags').select('id, label').is('deleted_at', null).order('label'),
      fetchDefaultSaleTagId(supabase),
    ]);
    if (tagErr || defErr) {
      toast.error(tagErr?.message ?? defErr?.message ?? 'Could not load tags');
      return;
    }
    const tagList = (tagRows ?? []) as { id: string; label: string }[];
    const { data: existingRows, error: exErr } = await supabase
      .from('expenses')
      .select('date, vendor_name, item_description, total_amount')
      .eq('business_id', businessId)
      .is('deleted_at', null);
    if (exErr) {
      toast.error(exErr.message);
      return;
    }
    const expenseKeys = new Set(((existingRows ?? []) as Record<string, unknown>[]).map(keyExpenses));
    let skipped = 0;
    function resolveExpenseTag(raw: string): string | null {
      const s = raw.trim();
      if (!s) return defaultTagId ?? null;
      if (tagList.some((t) => t.id === s)) return s;
      const lower = s.toLowerCase();
      const hit = tagList.find((t) => t.label.trim().toLowerCase() === lower);
      return hit?.id ?? null;
    }

    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const dateRaw = getString(r, 'date');
      const date = normalizeDateTimeIso(dateRaw);
      const vendor = getString(r, 'vendor_name') || 'Unknown Vendor';
      const item = getString(r, 'item_description') || 'Misc expense';
      const qty = parseCsvNumberFlexible(getString(r, 'quantity'));
      const unitCost = parseCsvNumberFlexible(getString(r, 'unit_cost'));
      const mode = normalizePaymentMode(getString(r, 'payment_mode'));
      const totalRaw = getOptionalNumber(r, 'total_amount') ?? parseCsvNumberFlexible(getString(r, 'total_amount'));
      const expenseTagRaw = getString(r, 'expense_tag');
      const expenseTagId = resolveExpenseTag(expenseTagRaw);

      if (!date) issues.push({ row: rowNo, field: 'date', message: 'invalid date (use YYYY-MM-DD or DD/MM/YYYY)' });
      if (qty === null || qty <= 0) issues.push({ row: rowNo, field: 'quantity', message: 'must be > 0' });
      if (unitCost === null || unitCost < 0) issues.push({ row: rowNo, field: 'unit_cost', message: 'must be >= 0' });
      if (mode === null) issues.push({ row: rowNo, field: 'payment_mode', message: "must be cash or online" });
      if (!expenseTagId) {
        issues.push({
          row: rowNo,
          field: 'expense_tag',
          message: 'unknown tag (label or uuid, or empty if business has default)',
        });
      }

      if (
        date &&
        qty !== null &&
        qty > 0 &&
        unitCost !== null &&
        unitCost >= 0 &&
        mode !== null &&
        expenseTagId
      ) {
        const payload = {
          business_id: businessId,
          expense_tag_id: expenseTagId,
          date,
          vendor_name: vendor,
          item_description: item,
          quantity: qty,
          unit_cost: unitCost,
          total_amount: totalRaw ?? qty * unitCost,
          payment_mode: mode,
          notes: getString(r, 'notes') || null,
          product_id: null,
          update_inventory: false,
          category: getString(r, 'category').trim() || null,
        };
        const dedupeKey = keyExpenses(payload);
        if (dedupeKey && expenseKeys.has(dedupeKey)) {
          skipped += 1;
          skippedRows.push({ row: rowNo, reason: 'duplicate existing expense (skipped)' });
          return;
        }
        if (dedupeKey) expenseKeys.add(dedupeKey);
        valid.push({
          rowNo,
          payload,
        });
      }
    });

    let inserted = 0;
    if (valid.length > 0) {
      for (const v of valid) {
        const { error: insErr } = await supabase.from('expenses').insert(v.payload);
        if (insErr) issues.push({ row: v.rowNo, field: 'row', message: insErr.message });
        else inserted += 1;
      }
      await loadExpenses();
    }

    if (issues.length > 0) {
      downloadCsv('expenses_import_errors.csv', buildImportIssuesCsv(issues));
    }
    if (issues.length > 0 || skippedRows.length > 0) {
      const reportRows = [
        ...issues.map((i) => ({ row: i.row, field: i.field, message: i.message, status: 'error' })),
        ...skippedRows.map((s) => ({ row: s.row, field: 'row', message: s.reason, status: 'skipped' })),
      ];
      downloadCsv(
        'expenses_import_report.csv',
        rowsToCsv(['row', 'field', 'message', 'status'], reportRows),
      );
    }
    toast.success(`Expenses import complete: ${inserted} inserted, ${skipped} skipped, ${issues.length} failed.`);
    } catch (e) {
      devError('expenses import', e);
      toast.error(e instanceof Error ? e.message : 'Expenses import failed');
    } finally {
      setImporting(false);
    }
  }

  if (session.kind === 'loading') {
    return <PageLoadingSkeleton />;
  }

  if (session.kind === 'redirect_login') {
    return <SessionRedirectNotice to="login" />;
  }

  if (session.kind === 'error') {
    return <p className="text-sm text-destructive">{session.message}</p>;
  }

  if (session.kind === 'redirect_home') {
    return <SessionRedirectNotice to="home" />;
  }

  if (!businessId) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Expenses"
        description="Operating costs and stock purchases. Use Stock Purchase when buying inventory (updates catalog cost and stock). Otherwise use a single amount and optional category."
        actions={
          <>
            <div className="flex items-center gap-2">
              <Label htmlFor="expenses-year-filter" className="text-xs text-muted-foreground">
                Year
              </Label>
              <select
                id="expenses-year-filter"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
              >
                <option value="all">All years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl text-sm font-semibold md:h-11 md:text-base"
              disabled={selectedExpenseIds.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete selected ({selectedExpenseIds.size})
            </Button>
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl text-sm font-semibold shadow-sm md:h-11 md:text-base"
              onClick={openNew}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New expense
            </Button>
            <ModuleCsvMenu
              menuAriaLabel="Expenses CSV import"
              busy={importing}
              disabled={!businessId}
              onDownloadTemplate={downloadExpensesTemplate}
              onFileSelected={(f) => void importExpensesFile(f)}
            />
          </>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ExpenseList
        expenses={filteredExpenses}
        loading={loading}
        onEdit={(row) => openEdit(row)}
        onArchive={requestArchive}
        onRefresh={() => void loadExpenses()}
        selectedIds={selectedExpenseIds}
        onToggleSelect={(id, checked) =>
          setSelectedExpenseIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          })
        }
        onToggleSelectAll={(checked) =>
          setSelectedExpenseIds(checked ? new Set(filteredExpenses.map((e) => e.id)) : new Set())
        }
      />

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

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setArchiveTarget(null);
            setReverseInventoryOnDelete(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              The expense row is permanently deleted. Deleting a stock purchase does not change current inventory stock.
              If your physical stock differs, adjust inventory separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiveTarget?.update_inventory === true && archiveTarget.product_id ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="reverse-inventory-on-delete" className="text-sm font-medium">
                    Reverse inventory before delete
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Turn on only if you want this delete to subtract purchased stock from inventory.
                  </p>
                </div>
                <Switch
                  id="reverse-inventory-on-delete"
                  checked={reverseInventoryOnDelete}
                  onCheckedChange={setReverseInventoryOnDelete}
                  aria-label="Reverse inventory before deleting expense"
                />
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmArchive()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected expenses?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedExpenseIds.size} selected expense record(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmBulkDeleteExpenses()}
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
