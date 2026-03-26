import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sale } from '@/lib/types/sale';

export type SaleListRow = {
  sale: Pick<Sale, 'id' | 'date' | 'customer_name' | 'total_amount' | 'payment_mode' | 'created_at'>;
  lineSummary: {
    primaryProduct: string;
    primaryCategory: string;
    totalQty: number;
    lineCount: number;
  };
};

export async function fetchSalesList(supabase: SupabaseClient): Promise<{
  data: SaleListRow[] | null;
  error: Error | null;
}> {
  const { data: sales, error: e1 } = await supabase
    .from('sales')
    .select('id, date, customer_name, total_amount, payment_mode, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (e1) return { data: null, error: new Error(e1.message) };
  if (!sales?.length) return { data: [], error: null };

  const saleIds = sales.map((s) => s.id);
  const { data: items, error: e2 } = await supabase
    .from('sale_items')
    .select('sale_id, quantity, product_id')
    .in('sale_id', saleIds);

  if (e2) return { data: null, error: new Error(e2.message) };

  const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category')
    .in('id', productIds);

  const productMap = new Map((products ?? []).map((p) => [p.id as string, p]));

  const bySale = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) {
    const arr = bySale.get(it.sale_id) ?? [];
    arr.push(it);
    bySale.set(it.sale_id, arr);
  }

  const rows: SaleListRow[] = sales.map((sale) => {
    const lines = bySale.get(sale.id) ?? [];
    const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0);
    const first = lines[0];
    const p = first ? productMap.get(first.product_id) : undefined;
    const primaryProduct =
      lines.length === 0
        ? '—'
        : lines.length > 1
          ? `${p?.name ?? 'Multiple'} (+${lines.length - 1})`
          : (p?.name ?? '—');
    return {
      sale,
      lineSummary: {
        primaryProduct,
        primaryCategory: p?.category ?? '—',
        totalQty,
        lineCount: lines.length,
      },
    };
  });

  return { data: rows, error: null };
}
