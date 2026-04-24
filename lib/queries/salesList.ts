import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sale } from '@/lib/types/sale';

/** Per-line detail for mobile accordion (and any drill-down UI). */
export type SaleListLineDetail = {
  id: string;
  product_id: string;
  product_name: string;
  variant: string | null;
  category: string;
  quantity: number;
  sale_price: number;
  cost_price_snapshot: number;
  mrp_snapshot: number;
  vs_mrp: number;
  profit: number;
};

export type SaleListRow = {
  sale: Pick<
    Sale,
    | 'id'
    | 'date'
    | 'customer_name'
    | 'customer_phone'
    | 'customer_address'
    | 'sale_type'
    | 'total_amount'
    | 'total_cost'
    | 'total_profit'
    | 'payment_mode'
    | 'notes'
    | 'created_at'
    | 'sale_tag_id'
  > & { sale_tag_label?: string | null };
  lineSummary: {
    primaryProduct: string;
    primaryCategory: string;
    totalQty: number;
    lineCount: number;
  };
  /** Ordered line items with snapshots (mobile accordion expanded body). */
  lines: SaleListLineDetail[];
};

export async function fetchSalesList(supabase: SupabaseClient): Promise<{
  data: SaleListRow[] | null;
  error: Error | null;
}> {
  const { data: sales, error: e1 } = await supabase
    .from('sales')
    .select(
      'id, date, customer_name, customer_phone, customer_address, sale_type, total_amount, total_cost, total_profit, payment_mode, notes, created_at, sale_tag_id, sale_tags ( label )',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (e1) return { data: null, error: new Error(e1.message) };
  if (!sales?.length) return { data: [], error: null };

  const saleIds = sales.map((s) => s.id);
  const { data: items, error: e2 } = await supabase
    .from('sale_items')
    .select(
      'id, sale_id, product_id, quantity, sale_price, cost_price_snapshot, mrp_snapshot, vs_mrp, profit',
    )
    .in('sale_id', saleIds);

  if (e2) return { data: null, error: new Error(e2.message) };

  const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, variant, category')
    .in('id', productIds);

  const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));

  const bySale = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) {
    const arr = bySale.get(it.sale_id) ?? [];
    arr.push(it);
    bySale.set(it.sale_id, arr);
  }

  const rows: SaleListRow[] = sales.map((raw) => {
    type TagJoin = { label: string } | { label: string }[] | null | undefined;
    const saleRow = raw as Record<string, unknown> & { id: string; sale_tags?: TagJoin };
    const tagJoin: TagJoin = saleRow.sale_tags;
    const sale_tag_label = Array.isArray(tagJoin) ? tagJoin[0]?.label : tagJoin?.label;
    const { sale_tags: _st, ...saleRest } = saleRow;
    const sale = {
      ...(saleRest as unknown as SaleListRow['sale']),
      sale_tag_id: String((saleRest as { sale_tag_id?: string }).sale_tag_id ?? ''),
      sale_tag_label: sale_tag_label ?? null,
    };

    const rawLines = bySale.get(sale.id) ?? [];
    const totalQty = rawLines.reduce((s, l) => s + Number(l.quantity), 0);
    const first = rawLines[0];
    const p0 = first ? productMap.get(first.product_id) : undefined;
    const primaryProduct =
      rawLines.length === 0
        ? '—'
        : rawLines.length > 1
          ? `${p0?.name ?? 'Multiple'} (+${rawLines.length - 1})`
          : (p0?.name ?? '—');

    const lines: SaleListLineDetail[] = rawLines.map((l) => {
      const p = productMap.get(l.product_id);
      return {
        id: l.id as string,
        product_id: l.product_id,
        product_name: p?.name ?? '—',
        variant: p?.variant ?? null,
        category: p?.category ?? '—',
        quantity: Number(l.quantity),
        sale_price: Number(l.sale_price),
        cost_price_snapshot: Number(l.cost_price_snapshot),
        mrp_snapshot: Number(l.mrp_snapshot),
        vs_mrp: Number(l.vs_mrp),
        profit: Number(l.profit),
      };
    });

    return {
      sale,
      lineSummary: {
        primaryProduct,
        primaryCategory: p0?.category ?? '—',
        totalQty,
        lineCount: rawLines.length,
      },
      lines,
    };
  });

  return { data: rows, error: null };
}
