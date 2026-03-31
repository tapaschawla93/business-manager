'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { fetchCustomerOrderHistory, fetchCustomersList } from '@/lib/queries/customers';
import { CustomersSearchBar } from './components/CustomersSearchBar';
import { RepeatCustomerToggle } from './components/RepeatCustomerToggle';
import { CustomersTable } from './components/CustomersTable';
import { CustomersMobileList } from './components/CustomersMobileList';
import { CustomerDetailDialog } from './components/CustomerDetailDialog';

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
  const [editingDraft, setEditingDraft] = useState({ name: '', phone: '', address: '' });

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

  async function openDetail(row: CustomerListRow) {
    setSelected(row);
    setDetailOpen(true);
    const supabase = getSupabaseClient();
    const { data, error } = await fetchCustomerOrderHistory(supabase, {
      customerId: row.customerId,
      phone: row.phone,
      name: row.name,
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
    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleting.customerId)
      .is('deleted_at', null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Customer deleted');
    setDeleting(null);
    void load();
  }

  if (session.kind === 'loading') return <PageLoadingSkeleton />;
  if (session.kind === 'redirect_login') return <SessionRedirectNotice to="login" />;
  if (session.kind === 'redirect_home') return <SessionRedirectNotice to="home" />;
  if (session.kind === 'error') return <p className="text-sm text-destructive">{session.message}</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Customer directory with repeat-customer insights and order history." />
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
              This will hide the customer from the list. Sales history remains unchanged.
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
    </div>
  );
}
