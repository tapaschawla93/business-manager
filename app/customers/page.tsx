'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import {
  buildImportIssuesCsv,
  getNullableString,
  getString,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
import { devError } from '@/lib/devLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { CustomerListRow, CustomerOrderHistoryRow } from '@/lib/types/customer';
import {
  customerPhoneDedupeKey,
  fetchCustomerOrderHistory,
  fetchCustomersList,
} from '@/lib/queries/customers';
import { CustomersSearchBar } from './components/CustomersSearchBar';
import { RepeatCustomerToggle } from './components/RepeatCustomerToggle';
import { CustomersTable } from './components/CustomersTable';
import { CustomersMobileList } from './components/CustomersMobileList';
import { CustomerDetailDialog } from './components/CustomerDetailDialog';
import { ModuleCsvMenu } from '@/components/ModuleCsvMenu';

export default function CustomersPage() {
  const session = useBusinessSession({ onMissingBusiness: 'redirect-home' });
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [selected, setSelected] = useState<CustomerListRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [orders, setOrders] = useState<CustomerOrderHistoryRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CustomerListRow | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState({ name: '', phone: '', address: '' });
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    setLoading(true);
    const { data, error } = await fetchCustomersList(supabase);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    if (session.kind !== 'ready') return;
    void load();
  }, [session.kind, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const nameMatch = q === '' || r.name.toLowerCase().includes(q);
      const repeatMatch = !repeatOnly || r.orderCount >= 2;
      return nameMatch && repeatMatch;
    });
  }, [rows, search, repeatOnly]);

  useEffect(() => {
    const visible = new Set(filtered.map((r) => r.customerId).filter((id): id is string => !!id));
    setSelectedCustomerIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [filtered]);

  async function openDetail(row: CustomerListRow) {
    setSelected(row);
    setDetailOpen(true);
    const supabase = getSupabaseClient();
    const { data, error } = await fetchCustomerOrderHistory(supabase, {
      customerId: row.customerId,
      phone: row.phone,
      name: row.name,
      saleIds: row.aggregatedSaleIds,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrders(data ?? []);
  }

  function openEdit(row: CustomerListRow) {
    if (!row.customerId) {
      toast.info('Create a customer record first, then edit.');
      return;
    }
    setSelected(row);
    setEditingDraft({
      name: row.name ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
    });
    setEditOpen(true);
  }

  async function createCustomerRecord(row: CustomerListRow) {
    if (row.customerId) return;
    if (session.kind !== 'ready') return;
    if (!row.phone?.trim()) {
      toast.error('Cannot create customer record without phone number.');
      return;
    }
    const supabase = getSupabaseClient();
    const payload = {
      business_id: session.businessId,
      name: row.name.trim() || 'Customer',
      phone: row.phone.trim(),
      address: row.address?.trim() || null,
    };
    const { error } = await supabase.from('customers').insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Customer record created');
    void load();
  }

  async function saveEdit() {
    if (!selected?.customerId) return;
    const supabase = getSupabaseClient();
    setSaving(true);
    const payload = {
      name: editingDraft.name.trim() || 'Customer',
      phone: editingDraft.phone.trim() || null,
      address: editingDraft.address.trim() || null,
    };
    const { error } = await supabase.from('customers').update(payload).eq('id', selected.customerId).is('deleted_at', null);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Customer updated');
    setEditOpen(false);
    void load();
  }

  async function confirmDelete() {
    if (!deleting?.customerId) return;
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('customers').delete().eq('id', deleting.customerId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Customer deleted');
    setDeleting(null);
    void load();
  }

  async function confirmBulkDeleteCustomers() {
    if (selectedCustomerIds.size === 0) return;
    setBulkDeleteOpen(false);
    const supabase = getSupabaseClient();
    let deleted = 0;
    let failed = 0;
    for (const id of selectedCustomerIds) {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) failed += 1;
      else deleted += 1;
    }
    setSelectedCustomerIds(new Set());
    if (failed > 0) toast.error(`Deleted ${deleted} customer(s), ${failed} failed.`);
    else toast.success(`Deleted ${deleted} customer(s).`);
    void load();
  }

  function downloadCustomersTemplate() {
    const headers = ['name', 'phone', 'address'];
    const rows = [{ name: 'Priya Sharma', phone: '9876543210', address: 'Delhi' }];
    downloadCsv('template_customers.csv', rowsToCsv(headers, rows));
  }

  const CUSTOMERS_INSERT_BATCH = 50;

  async function importCustomersFile(file: File) {
    if (session.kind !== 'ready') return;
    const businessId = session.businessId;
    setImporting(true);
    try {
      const supabase = getSupabaseClient();
      const text = await file.text();
      const { rows } = parseCsv(text);
      const issues: ImportIssue[] = [];
      const { data: existingRows, error: exErr } = await supabase
        .from('customers')
        .select('phone')
        .eq('business_id', businessId)
        .is('deleted_at', null);
      if (exErr) {
        toast.error(exErr.message);
        return;
      }
      const phonesSeen = new Set(
        ((existingRows ?? []) as { phone: string | null }[])
          .map((row) => customerPhoneDedupeKey(row.phone))
          .filter((k) => k.length > 0),
      );
      type PendingRow = {
        rowNo: number;
        payload: {
          business_id: string;
          name: string;
          phone: string;
          address: string | null;
        };
      };
      const pending: PendingRow[] = [];
      let skipped = 0;
      for (let idx = 0; idx < rows.length; idx += 1) {
        const r = rows[idx]!;
        const rowNo = idx + 2;
        const phone = getString(r, 'phone');
        const dedupeKey = customerPhoneDedupeKey(phone);
        if (!dedupeKey) {
          skipped += 1;
          continue;
        }
        if (phonesSeen.has(dedupeKey)) {
          skipped += 1;
          continue;
        }
        phonesSeen.add(dedupeKey);
        pending.push({
          rowNo,
          payload: {
            business_id: businessId,
            name: getString(r, 'name') || 'Customer',
            phone,
            address: getNullableString(r, 'address'),
          },
        });
      }

      let inserted = 0;
      for (let i = 0; i < pending.length; i += CUSTOMERS_INSERT_BATCH) {
        const slice = pending.slice(i, i + CUSTOMERS_INSERT_BATCH);
        const payloads = slice.map((p) => p.payload);
        const { error: batchErr } = await supabase.from('customers').insert(payloads);
        if (!batchErr) {
          inserted += slice.length;
          continue;
        }
        for (const item of slice) {
          const { error: rowErr } = await supabase.from('customers').insert(item.payload);
          if (rowErr) issues.push({ row: item.rowNo, field: 'row', message: rowErr.message });
          else inserted += 1;
        }
      }
      if (issues.length > 0) {
        downloadCsv('customers_import_errors.csv', buildImportIssuesCsv(issues));
      }
      toast.success(
        `Customers import: ${inserted} added, ${skipped} skipped (empty or duplicate after phone normalization), ${issues.length} row errors.`,
      );
      await load();
    } catch (e) {
      devError('customers import', e);
      toast.error(e instanceof Error ? e.message : 'Customers import failed');
    } finally {
      setImporting(false);
    }
  }

  if (session.kind === 'loading') return <PageLoadingSkeleton />;
  if (session.kind === 'redirect_login') return <SessionRedirectNotice to="login" />;
  if (session.kind === 'redirect_home') return <SessionRedirectNotice to="home" />;
  if (session.kind === 'error') return <p className="text-sm text-destructive">{session.message}</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Customer directory with repeat-customer insights and order history."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl text-sm font-semibold md:h-11 md:text-base"
              disabled={selectedCustomerIds.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete selected ({selectedCustomerIds.size})
            </Button>
            <ModuleCsvMenu
              menuAriaLabel="Customers CSV import"
              busy={importing}
              disabled={session.kind !== 'ready'}
              onDownloadTemplate={downloadCustomersTemplate}
              onFileSelected={(f) => void importCustomersFile(f)}
            />
          </>
        }
      />
      <Card className="border-border/80 shadow-md">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <CustomersSearchBar value={search} onChange={setSearch} />
            <RepeatCustomerToggle checked={repeatOnly} onChange={setRepeatOnly} />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading customers...</p>
          ) : (
            <>
              <div className="hidden md:block">
                <CustomersTable
                  rows={filtered}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                  onCreate={createCustomerRecord}
                  selectedIds={selectedCustomerIds}
                  onToggleSelect={(id, checked) =>
                    setSelectedCustomerIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                  onToggleSelectAll={(checked) => {
                    if (checked) {
                      setSelectedCustomerIds(
                        new Set(filtered.map((r) => r.customerId).filter((id): id is string => !!id)),
                      );
                    } else {
                      setSelectedCustomerIds(new Set());
                    }
                  }}
                />
              </div>
              <div className="md:hidden">
                <CustomersMobileList
                  rows={filtered}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                  onCreate={createCustomerRecord}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerDetailDialog open={detailOpen} onOpenChange={setDetailOpen} customer={selected} orders={orders} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Update customer details used for future sales matching.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer-name">Name</Label>
              <Input
                id="customer-name"
                value={editingDraft.name}
                onChange={(e) => setEditingDraft((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input
                id="customer-phone"
                value={editingDraft.phone}
                onChange={(e) => setEditingDraft((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-address">Address</Label>
              <Textarea
                id="customer-address"
                value={editingDraft.address}
                onChange={(e) => setEditingDraft((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer record is permanently removed. Linked sales keep their snapshot name/phone; the customer link is
              cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected customers?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {selectedCustomerIds.size} selected customer record(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmBulkDeleteCustomers()}
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
