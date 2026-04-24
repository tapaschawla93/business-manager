'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Product } from '@/lib/types/product';
import { formatInrDisplay } from '@/lib/formatInr';
import { PaymentToggle } from '@/components/PaymentToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CustomerPicker } from '@/components/CustomerPicker';
import { ProductPicker } from './ProductPicker';
import { ProductLineRow, type LineDraft } from './ProductLineRow';
import { fetchStockByProductId } from '@/lib/queries/inventory';
import {
  fetchComponentShortfallsForLines,
  fetchProductComponentCounts,
} from '@/lib/queries/saleComponentHints';
import type { Customer } from '@/lib/types/customer';
import type { SaleListRow } from '@/lib/queries/salesList';
import { fetchCustomersList } from '@/lib/queries/customers';
import { saleRpcUserHint } from '@/lib/saleRpcUserHint';
import { SaleTagPicker } from '@/components/SaleTagPicker';
import {
  createSaleTag,
  fetchDefaultSaleTagId,
  fetchSaleTags,
} from '@/lib/queries/saleTags';
import type { SaleTag } from '@/lib/types/saleTag';

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize DB `date` / timestamptz to `input[type=date]` value. */
function saleDateToInput(iso: string): string {
  if (!iso) return todayLocalISODate();
  const head = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return todayLocalISODate();
  }
}

function emptyLine(): LineDraft {
  return {
    localId: newLocalId(),
    productId: null,
    label: '',
    categoryPreview: null,
    quantity: '1',
    salePrice: '',
    mrpPreview: null,
    costPreview: null,
    stockOnHand: null,
  };
}

function jsonNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** save_sale returns jsonb_build_object(sale_id, total_amount, total_cost, total_profit). */
function parseSaveSaleResult(data: unknown): {
  sale_id: string;
  total_amount: number;
  total_cost: number;
  total_profit: number;
} | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const saleId = o.sale_id;
  if (typeof saleId !== 'string' || saleId.length === 0) return null;

  const totalAmount = jsonNumber(o.total_amount);
  const totalCost = jsonNumber(o.total_cost);
  const totalProfit = jsonNumber(o.total_profit);
  if (totalAmount === null || totalCost === null || totalProfit === null) return null;

  return {
    sale_id: saleId,
    total_amount: totalAmount,
    total_cost: totalCost,
    total_profit: totalProfit,
  };
}

/**
 * Mobile-first sale entry: search product → set qty/price → add more lines → Save (RPC).
 * Stored totals always come from save_sale RPC (server reads product cost/MRP).
 */
export function SalesForm({
  onSaved,
  compact,
  editSale,
  onDiscardEdit,
}: {
  onSaved?: () => void;
  compact?: boolean;
  /** When set, submit calls `update_sale` instead of `save_sale`. */
  editSale?: SaleListRow | null;
  onDiscardEdit?: () => void;
} = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [date, setDate] = useState(todayLocalISODate);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [saleType, setSaleType] = useState<'B2C' | 'B2B' | 'B2B2C' | ''>('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'online'>('cash');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  /** `product_components` row counts per product for BOM hints (prd.v3.5.2). */
  const [componentCountByProductId, setComponentCountByProductId] = useState<Record<string, number>>({});
  const [savedCustomers, setSavedCustomers] = useState<Pick<Customer, 'id' | 'name' | 'phone' | 'address'>[]>([]);
  /** Shown on CustomerPicker trigger after a saved row is chosen (prd.v3.5.4). */
  const [customerPickDisplay, setCustomerPickDisplay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [saleTags, setSaleTags] = useState<SaleTag[]>([]);
  const [defaultSaleTagId, setDefaultSaleTagId] = useState<string | null>(null);
  const [saleTagId, setSaleTagId] = useState<string | null>(null);
  /** Avoid re-hydrating edit mode when `products` refetches after save. */
  const lastHydratedEditSaleIdRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);

  const loadProducts = useCallback(async () => {
    const supabase = getSupabaseClient();
    setLoadingProducts(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    setLoadingProducts(false);
    if (err) {
      setError(err.message);
      return;
    }
    setProducts((data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const loadSaleTagData = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [{ data: tags, error: tErr }, { data: defId, error: dErr }] = await Promise.all([
      fetchSaleTags(supabase),
      fetchDefaultSaleTagId(supabase),
    ]);
    if (tErr) {
      toast.error(tErr.message);
      return;
    }
    if (dErr) {
      toast.error(dErr.message);
      return;
    }
    setSaleTags(tags ?? []);
    setDefaultSaleTagId(defId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data, error: pErr } = await supabase.from('profiles').select('business_id').maybeSingle();
      if (cancelled || pErr) return;
      setBusinessId((data?.business_id as string | undefined) ?? null);
      await loadSaleTagData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSaleTagData]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();
    void (async () => {
      const { data, error: err } = await fetchCustomersList(supabase);
      if (cancelled) return;
      if (err) {
        toast.error(err.message);
        return;
      }
      setSavedCustomers(
        (data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          address: r.address,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** New sale: default tag; edit: row tag. */
  useEffect(() => {
    if (editSale) {
      const id = editSale.sale.sale_tag_id;
      setSaleTagId(id && id.length > 0 ? id : null);
      return;
    }
    const fallback =
      defaultSaleTagId && saleTags.some((t) => t.id === defaultSaleTagId)
        ? defaultSaleTagId
        : saleTags[0]?.id ?? null;
    setSaleTagId(fallback);
  }, [editSale?.sale.id, defaultSaleTagId, saleTags, editSale]);

  const productIdsOnLines = useMemo(
    () => [...new Set(lines.map((l) => l.productId).filter((id): id is string => Boolean(id)))],
    [lines],
  );

  useEffect(() => {
    if (productIdsOnLines.length === 0) {
      setComponentCountByProductId({});
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseClient();
    void (async () => {
      const { data, error: err } = await fetchProductComponentCounts(supabase, productIdsOnLines);
      if (cancelled || err || !data) return;
      setComponentCountByProductId(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [productIdsOnLines]);

  const refreshStock = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: err } = await fetchStockByProductId(supabase);
    if (!err && data) setStockByProduct(data);
  }, []);

  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

  /** Prefill when editing an existing sale (waits for product list). */
  useEffect(() => {
    if (!editSale) {
      lastHydratedEditSaleIdRef.current = null;
      return;
    }
    if (products.length === 0) return;
    if (lastHydratedEditSaleIdRef.current === editSale.sale.id) return;
    lastHydratedEditSaleIdRef.current = editSale.sale.id;

    const s = editSale.sale;
    setDate(saleDateToInput(s.date));
    setCustomerName(s.customer_name ?? '');
    setCustomerPhone(s.customer_phone ?? '');
    setCustomerAddress(s.customer_address ?? '');
    setCustomerPickDisplay(
      s.customer_phone?.trim()
        ? `${(s.customer_name ?? 'Customer').trim() || 'Customer'} · ${s.customer_phone.trim()}`
        : null,
    );
    setSaleType(s.sale_type ?? '');
    setPaymentMode(s.payment_mode);
    setNotes(s.notes ?? '');
    setLines(
      editSale.lines.length > 0
        ? editSale.lines.map((line) => ({
            localId: newLocalId(),
            productId: line.product_id,
            label:
              line.variant?.trim() !== ''
                ? `${line.product_name} (${line.variant})`
                : line.product_name,
            categoryPreview: line.category,
            quantity: String(line.quantity),
            salePrice: String(line.sale_price),
            mrpPreview: line.mrp_snapshot,
            costPreview: line.cost_price_snapshot,
            stockOnHand: null,
          }))
        : [emptyLine()],
    );
  }, [editSale, products]);

  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        if (!l.productId) return { ...l, stockOnHand: null };
        const v = stockByProduct[l.productId];
        return { ...l, stockOnHand: v !== undefined ? v : 0 };
      }),
    );
  }, [stockByProduct]);

  const previewTotals = useMemo(() => {
    let amount = 0;
    let cost = 0;
    for (const line of lines) {
      const q = Number(line.quantity);
      const p = Number(line.salePrice);
      if (!line.productId || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p)) continue;
      if (line.costPreview == null) continue;
      amount += p * q;
      cost += line.costPreview * q;
    }
    return {
      totalAmount: round2(amount),
      totalCost: round2(cost),
      totalProfit: round2(amount - cost),
    };
  }, [lines]);

  function setLine(id: string, next: LineDraft) {
    setLines((prev) => prev.map((l) => (l.localId === id ? next : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) {
        return [emptyLine()];
      }
      return prev.filter((l) => l.localId !== id);
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function onPickProduct(localId: string, p: Product) {
    const onHand = stockByProduct[p.id];
    setLines((prev) =>
      prev.map((l) =>
        l.localId === localId
          ? {
              ...l,
              productId: p.id,
              label: p.name + (p.variant ? ` (${p.variant})` : ''),
              categoryPreview: p.category,
              salePrice: String(p.mrp),
              mrpPreview: Number(p.mrp),
              costPreview: Number(p.cost_price),
              stockOnHand: onHand !== undefined ? onHand : null,
            }
          : l,
      ),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    setError(null);

    const ready = lines.filter(
      (l) =>
        l.productId &&
        Number(l.quantity) > 0 &&
        Number.isFinite(Number(l.salePrice)) &&
        Number(l.salePrice) >= 0,
    );
    if (ready.length === 0) {
      setError('Add at least one line with product, quantity, and sale price.');
      return;
    }
    if (!saleTagId) {
      setError('Select a tag for this sale.');
      return;
    }
    const payload = ready.map((l) => ({
      product_id: l.productId!,
      quantity: Number(l.quantity),
      sale_price: Number(l.salePrice),
    }));

    submitInFlightRef.current = true;
    setSaving(true);
    try {
      const supabase = getSupabaseClient();

      const { data: bomCounts } = await fetchProductComponentCounts(
        supabase,
        payload.map((p) => p.product_id),
      );
      const noBomNames = payload
        .filter((p) => (bomCounts?.[p.product_id] ?? 0) === 0)
        .map((p) => products.find((x) => x.id === p.product_id)?.name ?? 'Product');
      const distinctNoBom = [...new Set(noBomNames)];
      if (distinctNoBom.length > 0) {
        toast.warning(
          `No inventory BOM for: ${distinctNoBom.join(', ')}. Only catalog stock (ledger) decreases on save — link components in Products to deduct raw materials.`,
        );
      }

      const { data: shortfalls, error: shortfallErr } = await fetchComponentShortfallsForLines(supabase, payload);
      if (!shortfallErr && shortfalls && shortfalls.length > 0) {
        toast.warning(
          `Component stock may be insufficient — save may fail: ${shortfalls
            .map((s) => `${s.inventoryItemName} (need ${s.needed}, have ${s.available})`)
            .join('; ')}`,
        );
      }

      const baseArgs = {
        p_date: date,
        p_customer_name: customerName.trim() === '' ? null : customerName.trim(),
        p_customer_phone: customerPhone.trim() === '' ? null : customerPhone.trim(),
        p_customer_address: customerAddress.trim() === '' ? null : customerAddress.trim(),
        p_sale_type: saleType === '' ? null : saleType,
        p_payment_mode: paymentMode,
        p_notes: notes.trim() === '' ? null : notes.trim(),
        p_lines: payload,
        p_sale_tag_id: saleTagId,
      };
      const { data, error: rpcErr } = editSale
        ? await supabase.rpc('update_sale', { p_sale_id: editSale.sale.id, ...baseArgs })
        : await supabase.rpc('save_sale', baseArgs);

      if (rpcErr) {
        const hint = saleRpcUserHint(rpcErr.message, rpcErr.code);
        setError(hint);
        toast.error(hint);
        return;
      }

      const row = parseSaveSaleResult(data);
      if (row) {
        toast.success(
          editSale
            ? `Sale updated. Amount ${formatInrDisplay(row.total_amount)} · Profit ${formatInrDisplay(row.total_profit)}`
            : `Sale saved. Amount ${formatInrDisplay(row.total_amount)} · Profit ${formatInrDisplay(row.total_profit)}`,
        );
      } else {
        toast.warning(
          'Saved, but the server response could not be read. Confirm under Settings → Export sales.',
        );
      }
      if (!editSale) {
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setCustomerPickDisplay(null);
        setSaleType('');
        setNotes('');
        setLines([emptyLine()]);
      }
      void loadProducts();
      void refreshStock();
      onSaved?.();
    } finally {
      submitInFlightRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={compact ? 'space-y-5' : 'mx-auto max-w-lg space-y-5'}
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">Line items</h2>
        {loadingProducts ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading products…</p>
        ) : (
          <>
            {lines.map((line, idx) => (
              <div key={line.localId} className="mt-3 space-y-2">
                <ProductPicker
                  products={products}
                  triggerLabel={line.productId ? line.label : undefined}
                  onPick={(p) => onPickProduct(line.localId, p)}
                />
                <ProductLineRow
                  line={line}
                  onChange={(next) => setLine(line.localId, next)}
                  onRemove={() => removeLine(line.localId)}
                  componentRowCount={
                    line.productId
                      ? (componentCountByProductId[line.productId] ?? null)
                      : null
                  }
                />
                {idx < lines.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
            <Button type="button" variant="outline" className="mt-3 w-full border-dashed" onClick={addLine}>
              + Add more products
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3">
            <SaleTagPicker
              tags={saleTags}
              value={saleTagId}
              onChange={setSaleTagId}
              defaultTagId={defaultSaleTagId}
              showDefaultHint
              disabled={saving || loadingProducts}
              onCreateTag={async (label) => {
                if (!businessId) {
                  toast.error('No business context');
                  return null;
                }
                const supabase = getSupabaseClient();
                const { data: row, error: cErr } = await createSaleTag(supabase, businessId, label);
                if (cErr) {
                  toast.error(cErr.message);
                  return null;
                }
                await loadSaleTagData();
                return row?.id ?? null;
              }}
            />
            <div className="space-y-1">
              <Label>Sale type (optional)</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['B2C', 'B2B', 'B2B2C'] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={saleType === t ? 'default' : 'outline'}
                    className="h-9"
                    onClick={() => setSaleType((prev) => (prev === t ? '' : t))}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <PaymentToggle value={paymentMode} onChange={setPaymentMode} />
            </div>
            <div className="space-y-1">
              <Label>Saved customer (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Pick a directory row or type below — phone links the sale to Customers when saved.
              </p>
              <CustomerPicker
                customers={savedCustomers}
                triggerLabel={customerPickDisplay ?? undefined}
                onPick={(c) => {
                  setCustomerName(c.name?.trim() ?? '');
                  setCustomerPhone(c.phone?.trim() ?? '');
                  setCustomerAddress(c.address?.trim() ?? '');
                  setCustomerPickDisplay(c.phone?.trim() ? `${c.name} · ${c.phone}` : c.name);
                }}
                onClear={() => {
                  setCustomerName('');
                  setCustomerPhone('');
                  setCustomerAddress('');
                  setCustomerPickDisplay(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Customer name (optional)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Customer phone (optional)</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="space-y-1">
              <Label>Customer address (optional)</Label>
              <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <Card className="border-primary/20 bg-accent/40 shadow-none">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold text-foreground">Preview totals (browser)</p>
          <p className="mt-1 text-muted-foreground">Amount {formatInrDisplay(previewTotals.totalAmount)}</p>
          <p className="text-muted-foreground">Cost {formatInrDisplay(previewTotals.totalCost)}</p>
          <p className="font-medium text-primary">Profit {formatInrDisplay(previewTotals.totalProfit)}</p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        {editSale ? (
          <Button type="button" variant="outline" className="h-10 text-sm md:h-11 md:text-base" onClick={onDiscardEdit}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="full" disabled={saving || loadingProducts}>
          {saving ? 'Saving…' : editSale ? 'Save changes' : 'Save sale'}
        </Button>
      </div>
    </form>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
