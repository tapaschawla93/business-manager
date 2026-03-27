'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
import { ProductPicker } from './ProductPicker';
import { ProductLineRow, type LineDraft } from './ProductLineRow';
import { fetchStockByProductId } from '@/lib/queries/inventory';

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
export function SalesForm({ onSaved, compact }: { onSaved?: () => void; compact?: boolean } = {}) {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refreshStock = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: err } = await fetchStockByProductId(supabase);
    if (!err && data) setStockByProduct(data);
  }, []);

  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

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
    const payload = ready.map((l) => ({
      product_id: l.productId,
      quantity: Number(l.quantity),
      sale_price: Number(l.salePrice),
    }));

    const supabase = getSupabaseClient();
    setSaving(true);
    const { data, error: rpcErr } = await supabase.rpc('save_sale', {
      p_date: date,
      p_customer_name: customerName.trim() === '' ? null : customerName.trim(),
      p_customer_phone: customerPhone.trim() === '' ? null : customerPhone.trim(),
      p_customer_address: customerAddress.trim() === '' ? null : customerAddress.trim(),
      p_sale_type: saleType === '' ? null : saleType,
      p_payment_mode: paymentMode,
      p_notes: notes.trim() === '' ? null : notes.trim(),
      p_lines: payload,
    });
    setSaving(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.error(rpcErr.message);
      return;
    }

    const row = parseSaveSaleResult(data);
    if (row) {
      toast.success(
        `Sale saved. Amount ${formatInrDisplay(row.total_amount)} · Profit ${formatInrDisplay(row.total_profit)}`,
      );
    } else {
      toast.warning(
        'Saved, but the server response could not be read. Confirm under Settings → Export sales.',
      );
    }
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setSaleType('');
    setNotes('');
    setLines([emptyLine()]);
    void loadProducts();
    void refreshStock();
    onSaved?.();
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

      <Button type="submit" size="full" disabled={saving || loadingProducts}>
        {saving ? 'Saving…' : 'Save sale'}
      </Button>
    </form>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
