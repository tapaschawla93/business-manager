'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { PaymentToggle } from '@/components/PaymentToggle';
import { formatInrDisplay } from '@/lib/formatInr';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Expense } from '@/lib/types/expense';
import type { Product } from '@/lib/types/product';
import type { Vendor } from '@/lib/types/vendor';
import { fetchActiveVendors } from '@/lib/queries/vendors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VendorPicker } from '@/components/VendorPicker';
import { ProductPicker } from '@/app/sales/components/ProductPicker';

function nowDatetimeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function expenseToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

export function ExpenseForm({
  businessId,
  editing,
  onDiscardEdit,
  onSaved,
}: {
  businessId: string;
  editing: Expense | null;
  onDiscardEdit: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [notes, setNotes] = useState('');
  const [dateLocal, setDateLocal] = useState(nowDatetimeLocal);
  const [productId, setProductId] = useState<string | null>(null);
  const [productTriggerLabel, setProductTriggerLabel] = useState<string | undefined>(undefined);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [addingVendor, setAddingVendor] = useState(false);

  const loadCatalog = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [vRes, pRes] = await Promise.all([
      fetchActiveVendors(supabase, { businessId }),
      supabase.from('products').select('*').is('deleted_at', null).order('name', { ascending: true }),
    ]);
    if (!vRes.error && vRes.data) setVendors(vRes.data);
    if (!pRes.error && pRes.data) setProducts(pRes.data as Product[]);
  }, [businessId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (editing) {
      setVendorName(editing.vendor_name);
      setVendorId(editing.vendor_id ?? null);
      setItemDescription(editing.item_description);
      setQuantity(String(editing.quantity));
      setUnitCost(String(editing.unit_cost));
      setPaymentMode(editing.payment_mode);
      setNotes(editing.notes ?? '');
      setDateLocal(expenseToDatetimeLocal(editing.date));
      setProductId(editing.product_id ?? null);
      return;
    }
    setVendorName('');
    setVendorId(null);
    setItemDescription('');
    setQuantity('1');
    setUnitCost('');
    setPaymentMode('cash');
    setNotes('');
    setDateLocal(nowDatetimeLocal());
    setProductId(null);
    setProductTriggerLabel(undefined);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    if (!editing.product_id) {
      setProductTriggerLabel(undefined);
      return;
    }
    const p = products.find((x) => x.id === editing.product_id);
    setProductTriggerLabel(
      p ? p.name + (p.variant ? ` (${p.variant})` : '') : editing.item_description,
    );
  }, [editing, products]);

  const totalPreview = useMemo(() => {
    const q = Number(quantity);
    const u = Number(unitCost);
    if (!Number.isFinite(q) || !Number.isFinite(u)) return null;
    return Math.round(q * u * 100) / 100;
  }, [quantity, unitCost]);

  function clearLinkedProduct() {
    setProductId(null);
    setProductTriggerLabel(undefined);
  }

  async function handleQuickAddVendor(e: FormEvent) {
    e.preventDefault();
    const name = newVendorName.trim();
    if (!name) {
      toast.error('Vendor name is required');
      return;
    }
    const supabase = getSupabaseClient();
    setAddingVendor(true);
    const { data, error: insErr } = await supabase
      .from('vendors')
      .insert({
        business_id: businessId,
        name,
        phone: newVendorPhone.trim() === '' ? null : newVendorPhone.trim(),
        email: null,
        notes: null,
      })
      .select('id, name')
      .single();
    setAddingVendor(false);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    const row = data as { id: string; name: string };
    toast.success('Vendor saved');
    setVendorId(row.id);
    setVendorName(row.name);
    setVendorDialogOpen(false);
    setNewVendorName('');
    setNewVendorPhone('');
    await loadCatalog();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const q = Number(quantity);
    const u = Number(unitCost);
    if (!vendorName.trim() || !itemDescription.trim()) {
      setError('Vendor and item description are required');
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError('Quantity must be a number > 0');
      return;
    }
    if (!Number.isFinite(u) || u < 0) {
      setError('Unit cost must be a number ≥ 0');
      return;
    }

    const totalAmount = Math.round(q * u * 100) / 100;
    const dateIso = new Date(dateLocal).toISOString();

    const supabase = getSupabaseClient();
    setSaving(true);

    const common = {
      date: dateIso,
      vendor_name: vendorName.trim(),
      vendor_id: vendorId,
      item_description: itemDescription.trim(),
      product_id: productId,
      quantity: q,
      unit_cost: u,
      total_amount: totalAmount,
      payment_mode: paymentMode,
      notes: notes.trim() === '' ? null : notes.trim(),
    };

    if (editing) {
      const { error: upErr } = await supabase
        .from('expenses')
        .update(common)
        .eq('id', editing.id)
        .eq('business_id', businessId)
        .is('deleted_at', null);

      setSaving(false);
      if (upErr) {
        setError(upErr.message);
        toast.error(upErr.message);
        return;
      }
      toast.success('Expense updated');
    } else {
      const { error: insErr } = await supabase.from('expenses').insert({
        business_id: businessId,
        ...common,
      });

      setSaving(false);
      if (insErr) {
        setError(insErr.message);
        toast.error(insErr.message);
        return;
      }
      toast.success('Expense added');
      setVendorName('');
      setVendorId(null);
      setItemDescription('');
      setQuantity('1');
      setUnitCost('');
      setPaymentMode('cash');
      setNotes('');
      setDateLocal(nowDatetimeLocal());
      clearLinkedProduct();
    }

    await onSaved();
    if (editing) onDiscardEdit();
  }

  return (
    <>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Card className="border-0 shadow-none">
          <CardContent className="space-y-3 p-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date & time" required>
                <Input
                  type="datetime-local"
                  value={dateLocal}
                  onChange={(e) => setDateLocal(e.target.value)}
                  required
                />
              </Field>
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Vendor *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-primary"
                    onClick={() => setVendorDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New vendor
                  </Button>
                </div>
                {vendors.length > 0 ? (
                  <VendorPicker
                    vendors={vendors}
                    triggerLabel={vendorId ? vendorName : undefined}
                    onPick={(v) => {
                      setVendorId(v.id);
                      setVendorName(v.name);
                    }}
                    onClear={() => {
                      setVendorId(null);
                    }}
                  />
                ) : null}
                <Input
                  value={vendorName}
                  onChange={(e) => {
                    setVendorName(e.target.value);
                    setVendorId(null);
                  }}
                  placeholder="Vendor name"
                  required
                  className="mt-1.5"
                />
              </div>
              <div className="space-y-1 sm:col-span-2 rounded-lg border border-dashed border-primary/25 bg-accent/30 p-3">
                <Label className="text-xs font-medium text-foreground">Receive into inventory (optional)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Link a catalogue product to increase on-hand units by the quantity below.
                </p>
                <ProductPicker
                  products={products}
                  triggerLabel={productTriggerLabel}
                  onPick={(p) => {
                    setProductId(p.id);
                    setProductTriggerLabel(p.name + (p.variant ? ` (${p.variant})` : ''));
                    setItemDescription(p.name + (p.variant ? ` (${p.variant})` : ''));
                    setUnitCost(String(p.cost_price));
                  }}
                />
                {productId ? (
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={clearLinkedProduct}>
                    Unlink product
                  </Button>
                ) : null}
              </div>
              <Field label="Item" required>
                <Input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required />
              </Field>
              <Field label="Quantity" required>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Field>
              <Field label="Unit cost (₹)" required>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  required
                />
              </Field>
              <div className="sm:col-span-2 space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/80 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-blue-900/70 dark:text-blue-200/80">
                    Net cost
                  </span>
                  <span className="text-xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
                    {totalPreview == null ? '₹0' : formatInrDisplay(totalPreview)}
                  </span>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Payment mode</Label>
                <PaymentToggle value={paymentMode} onChange={setPaymentMode} />
              </div>
              <Field label="Notes (optional)">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2">
          {editing && (
            <Button type="button" variant="outline" className="h-11" onClick={onDiscardEdit}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="full" disabled={saving} className="h-12 rounded-xl text-base font-semibold">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
          </Button>
        </div>
      </form>

      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>Creates a contact you can reuse on future expenses.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleQuickAddVendor(e)} className="space-y-3">
            <Field label="Name" required>
              <Input value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} required />
            </Field>
            <Field label="Phone (optional)">
              <Input value={newVendorPhone} onChange={(e) => setNewVendorPhone(e.target.value)} />
            </Field>
            <Button type="submit" size="full" disabled={addingVendor}>
              {addingVendor ? 'Saving…' : 'Save vendor'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
