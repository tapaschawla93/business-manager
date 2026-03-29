'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { VendorPicker } from '@/components/VendorPicker';
import { PaymentToggle } from '@/components/PaymentToggle';
import { ProductPicker } from '@/app/sales/components/ProductPicker';
import { formatInrDisplay } from '@/lib/formatInr';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchActiveVendors } from '@/lib/queries/vendors';
import type { Expense } from '@/lib/types/expense';
import type { Product } from '@/lib/types/product';
import type { Vendor } from '@/lib/types/vendor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

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

function productDisplayLabel(p: Product): string {
  return `${p.name}${p.variant ? ` · ${p.variant}` : ''}`;
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorDirectoryId, setVendorDirectoryId] = useState<string | null>(null);
  const [pickerLabel, setPickerLabel] = useState<string | undefined>(undefined);
  /** Free-text vendor when no directory row is selected. */
  const [vendorName, setVendorName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [nonInventoryAmount, setNonInventoryAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [notes, setNotes] = useState('');
  const [dateLocal, setDateLocal] = useState(nowDatetimeLocal);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [productPickerLabel, setProductPickerLabel] = useState<string | undefined>(undefined);
  /** Stock purchase mode — persists as `update_inventory` when a catalog product is used. */
  const [isStockPurchase, setIsStockPurchase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** New expense row saved, but ledger RPC failed — avoid duplicate insert; use Retry or Dismiss. */
  const [pendingStockLedgerSync, setPendingStockLedgerSync] = useState<{
    productId: string;
    delta: number;
    unitCost: number;
  } | null>(null);

  const loadVendors = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: vErr } = await fetchActiveVendors(supabase, { businessId });
    if (vErr) {
      toast.error(vErr.message || 'Could not load vendors');
      return;
    }
    setVendors(data ?? []);
  }, [businessId]);

  const loadProducts = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: pErr } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (pErr) {
      toast.error(pErr.message || 'Could not load products');
      return;
    }
    setProducts((data as Product[]) ?? []);
  }, [businessId]);

  useEffect(() => {
    void loadVendors();
    void loadProducts();
  }, [loadVendors, loadProducts]);

  useEffect(() => {
    setPendingStockLedgerSync(null);
    if (editing) {
      const stockMode = Boolean(editing.product_id && editing.update_inventory !== false);
      setIsStockPurchase(stockMode);
      setVendorName(editing.vendor_name ?? '');
      setVendorDirectoryId(editing.vendor_id);
      setPickerLabel(editing.vendor_id ? editing.vendor_name : undefined);
      setPaymentMode(editing.payment_mode);
      setNotes(editing.notes ?? '');
      setDateLocal(expenseToDatetimeLocal(editing.date));
      if (stockMode) {
        setProductId(editing.product_id);
        setProductPickerLabel(undefined);
        setQuantity(String(editing.quantity));
        setUnitCost(String(editing.unit_cost));
        setItemDescription('');
        setNonInventoryAmount('');
        setExpenseCategory('');
      } else {
        setProductId(null);
        setProductPickerLabel(undefined);
        setItemDescription(editing.item_description);
        setNonInventoryAmount(String(editing.total_amount));
        setExpenseCategory(editing.category ?? '');
        setQuantity('1');
        setUnitCost('');
      }
      return;
    }
    setVendorName('');
    setVendorDirectoryId(null);
    setPickerLabel(undefined);
    setItemDescription('');
    setNonInventoryAmount('');
    setExpenseCategory('');
    setQuantity('1');
    setUnitCost('');
    setPaymentMode('cash');
    setNotes('');
    setDateLocal(nowDatetimeLocal());
    setProductId(null);
    setProductPickerLabel(undefined);
    setIsStockPurchase(false);
  }, [editing]);

  useEffect(() => {
    if (!editing?.product_id || !isStockPurchase) return;
    const p = products.find((x) => x.id === editing.product_id);
    if (p) {
      setProductPickerLabel(productDisplayLabel(p));
    }
  }, [editing, products, isStockPurchase]);

  const totalPreview = useMemo(() => {
    const q = Number(quantity);
    const u = Number(unitCost);
    if (!Number.isFinite(q) || !Number.isFinite(u)) return null;
    return Math.round(q * u * 100) / 100;
  }, [quantity, unitCost]);

  const selectedProduct = useMemo(
    () => (productId ? products.find((p) => p.id === productId) ?? null : null),
    [productId, products],
  );

  async function syncCostFromStockExpense(pId: string, cost: number) {
    const supabase = getSupabaseClient();
    const { error: rpcErr } = await supabase.rpc('sync_product_cost_from_expense', {
      p_business_id: businessId,
      p_product_id: pId,
      p_unit_cost: cost,
    });
    if (rpcErr) {
      toast.error(rpcErr.message || 'Could not sync product cost from expense');
    }
  }

  /** Mirrors `inventory.quantity_on_hand` into `inventory_items` after the ledger has been updated (idempotent). */
  async function reconcileInventoryLineForProduct(pId: string) {
    const supabase = getSupabaseClient();
    const { error: rpcErr } = await supabase.rpc('reconcile_inventory_line_for_product', {
      p_product_id: pId,
    });
    if (rpcErr) {
      toast.error(rpcErr.message || 'Could not sync inventory line from ledger');
    }
  }

  function resetFormAfterNewStockExpenseSaved() {
    setVendorName('');
    setVendorDirectoryId(null);
    setPickerLabel(undefined);
    setQuantity('1');
    setUnitCost('');
    setPaymentMode('cash');
    setNotes('');
    setDateLocal(nowDatetimeLocal());
    setProductId(null);
    setProductPickerLabel(undefined);
    setIsStockPurchase(false);
    setPendingStockLedgerSync(null);
    setError(null);
  }

  async function retryStockLedgerSync() {
    if (!pendingStockLedgerSync || !businessId) return;
    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { productId, delta, unitCost } = pendingStockLedgerSync;
    const { error: dErr } = await supabase.rpc('inventory_apply_delta_for_tenant', {
      p_business_id: businessId,
      p_product_id: productId,
      p_delta: delta,
    });
    setSaving(false);
    if (dErr) {
      const msg =
        dErr.message ||
        'Stock could not be updated. Check Supabase migrations, then try again or edit this expense from the list.';
      setError(msg);
      toast.error(msg);
      return;
    }
    await syncCostFromStockExpense(productId, unitCost);
    await reconcileInventoryLineForProduct(productId);
    toast.success('Stock updated — expense was already saved.');
    resetFormAfterNewStockExpenseSaved();
    await onSaved();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const dateIso = new Date(dateLocal).toISOString();
    const supabase = getSupabaseClient();
    const vendor_name = vendorName.trim();
    const notesVal = notes.trim() === '' ? null : notes.trim();

    if (isStockPurchase) {
      const q = Number(quantity);
      const u = Number(unitCost);
      if (!productId) {
        setError('Select a catalog product');
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
      const p = products.find((x) => x.id === productId);
      const itemDesc = p ? productDisplayLabel(p) : 'Stock purchase';
      const totalAmount = Math.round(q * u * 100) / 100;

      const common = {
        date: dateIso,
        vendor_name,
        vendor_id: vendorDirectoryId,
        item_description: itemDesc,
        product_id: productId,
        quantity: q,
        unit_cost: u,
        total_amount: totalAmount,
        payment_mode: paymentMode,
        notes: notesVal,
        update_inventory: true,
        category: null as string | null,
      };

      setSaving(true);
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
        await syncCostFromStockExpense(productId, u);
        await reconcileInventoryLineForProduct(productId);
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
        // Ledger delta is applied here (not on AFTER INSERT trigger) so stock updates reliably via anon/PostgREST.
        const { error: dErr } = await supabase.rpc('inventory_apply_delta_for_tenant', {
          p_business_id: businessId,
          p_product_id: productId,
          p_delta: q,
        });
        if (dErr) {
          const msg =
            dErr.message ||
            'Expense was saved, but stock was not updated. Use Retry stock update (same expense — no duplicate) or Dismiss.';
          setError(msg);
          toast.error(msg);
          setPendingStockLedgerSync({ productId, delta: q, unitCost: u });
        } else {
          await syncCostFromStockExpense(productId, u);
          await reconcileInventoryLineForProduct(productId);
          toast.success('Expense added — stock updated');
          resetFormAfterNewStockExpenseSaved();
        }
      }

      await onSaved();
      if (editing) onDiscardEdit();
      return;
    }

    const desc = itemDescription.trim();
    const amt = Number(nonInventoryAmount);
    if (!desc) {
      setError('Description is required');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a number > 0');
      return;
    }
    const totalAmount = Math.round(amt * 100) / 100;
    const cat = expenseCategory.trim() || null;

    const common = {
      date: dateIso,
      vendor_name,
      vendor_id: vendorDirectoryId,
      item_description: desc,
      product_id: null as string | null,
      quantity: 1,
      unit_cost: totalAmount,
      total_amount: totalAmount,
      payment_mode: paymentMode,
      notes: notesVal,
      update_inventory: false,
      category: cat,
    };

    setSaving(true);
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
      setVendorDirectoryId(null);
      setPickerLabel(undefined);
      setItemDescription('');
      setNonInventoryAmount('');
      setExpenseCategory('');
      setPaymentMode('cash');
      setNotes('');
      setDateLocal(nowDatetimeLocal());
      setIsStockPurchase(false);
    }

    await onSaved();
    if (editing) onDiscardEdit();
  }

  return (
    <>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Card className="border-0 shadow-none">
          <CardContent className="space-y-3 p-0">
            <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Stock Purchase</p>
                  <p className="text-[11px] text-muted-foreground">
                    Turn on when this purchase adds stock for the selected product (required for inventory to update).
                  </p>
                </div>
                <Switch
                  checked={isStockPurchase}
                  onCheckedChange={(v) => {
                    setIsStockPurchase(v);
                    setError(null);
                    setPendingStockLedgerSync(null);
                    if (v) {
                      setItemDescription('');
                      setNonInventoryAmount('');
                      setExpenseCategory('');
                    } else {
                      setProductId(null);
                      setProductPickerLabel(undefined);
                      setQuantity('1');
                      setUnitCost('');
                    }
                  }}
                  disabled={!!editing}
                  aria-label="Stock purchase"
                />
              </div>
              {editing ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Purchase type cannot be changed when editing; cancel and add a new expense instead.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date & time" required>
                <Input
                  type="datetime-local"
                  value={dateLocal}
                  onChange={(e) => setDateLocal(e.target.value)}
                  required
                />
              </Field>

              {isStockPurchase ? (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Product *
                    </Label>
                    <ProductPicker
                      products={products}
                      triggerLabel={productPickerLabel}
                      onPick={(p) => {
                        setProductId(p.id);
                        setProductPickerLabel(productDisplayLabel(p));
                        setUnitCost(String(p.cost_price ?? ''));
                      }}
                    />
                    {selectedProduct ? (
                      <p className="text-sm font-medium text-foreground">{productDisplayLabel(selectedProduct)}</p>
                    ) : null}
                  </div>
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
                        Total
                      </span>
                      <span className="text-xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
                        {totalPreview == null ? '₹0' : formatInrDisplay(totalPreview)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <Field label="Category">
                      <Input
                        value={expenseCategory}
                        onChange={(e) => setExpenseCategory(e.target.value)}
                        placeholder="e.g. Marketing, Rent, Utilities"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Description" required>
                      <Input
                        value={itemDescription}
                        onChange={(e) => setItemDescription(e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Amount (₹)" required>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={nonInventoryAmount}
                        onChange={(e) => setNonInventoryAmount(e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Payment mode</Label>
                <PaymentToggle value={paymentMode} onChange={setPaymentMode} />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs">Vendor directory (optional)</Label>
                <VendorPicker
                  vendors={vendors}
                  triggerLabel={pickerLabel}
                  onPick={(v) => {
                    setVendorDirectoryId(v.id);
                    setVendorName(v.name);
                    setPickerLabel(v.name);
                  }}
                  onClear={() => {
                    setVendorDirectoryId(null);
                    setPickerLabel(undefined);
                  }}
                />
                {!vendorDirectoryId ? (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Vendor name (optional)</Label>
                    <Input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="As on invoice"
                    />
                  </div>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Field label="Notes (optional)">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>
        {pendingStockLedgerSync && !editing ? (
          <div className="space-y-3 rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/35">
            <p className="font-medium text-foreground">Expense saved — stock update failed</p>
            <p className="text-muted-foreground">
              Retry applies the same quantity to inventory without creating another expense. Dismiss clears this form if
              you will fix stock from the list instead.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="h-11 rounded-xl font-semibold"
                disabled={saving}
                onClick={() => void retryStockLedgerSync()}
              >
                {saving ? 'Working…' : 'Retry stock update'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                disabled={saving}
                onClick={() => resetFormAfterNewStockExpenseSaved()}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2">
          {editing && (
            <Button type="button" variant="outline" className="h-11" onClick={onDiscardEdit}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="full"
            disabled={saving || (!!pendingStockLedgerSync && !editing)}
            className="h-12 rounded-xl text-base font-semibold"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
          </Button>
        </div>
      </form>
    </>
  );
}
