'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PaymentToggle } from '@/components/PaymentToggle';
import { formatInrDisplay } from '@/lib/formatInr';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Expense } from '@/lib/types/expense';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [notes, setNotes] = useState('');
  const [dateLocal, setDateLocal] = useState(nowDatetimeLocal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setVendorName(editing.vendor_name);
      setItemDescription(editing.item_description);
      setQuantity(String(editing.quantity));
      setUnitCost(String(editing.unit_cost));
      setPaymentMode(editing.payment_mode);
      setNotes(editing.notes ?? '');
      setDateLocal(expenseToDatetimeLocal(editing.date));
      return;
    }
    setVendorName('');
    setItemDescription('');
    setQuantity('1');
    setUnitCost('');
    setPaymentMode('cash');
    setNotes('');
    setDateLocal(nowDatetimeLocal());
  }, [editing]);

  const totalPreview = useMemo(() => {
    const q = Number(quantity);
    const u = Number(unitCost);
    if (!Number.isFinite(q) || !Number.isFinite(u)) return null;
    return Math.round(q * u * 100) / 100;
  }, [quantity, unitCost]);

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
      item_description: itemDescription.trim(),
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
      setItemDescription('');
      setQuantity('1');
      setUnitCost('');
      setPaymentMode('cash');
      setNotes('');
      setDateLocal(nowDatetimeLocal());
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
                <Label className="text-xs">Vendor *</Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Vendor name"
                  required
                  className="mt-1.5"
                />
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

    </>
  );
}
