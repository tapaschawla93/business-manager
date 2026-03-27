import type { SupabaseClient } from '@supabase/supabase-js';

export type DashboardKPIs = {
  total_revenue: number;
  total_expenses: number;
  /** qty_on_hand × catalog cost_price */
  inventory_value: number;
  gross_profit: number;
  cash_in_hand: number;
  online_received: number;
  sales_count: number;
  average_sale_value: number;
};

export type TopProductRow = {
  product_id: string;
  label: string;
  revenue: number;
  avg_margin_pct: number | null;
};

export type TopProductsPayload = {
  top_by_revenue: TopProductRow[];
  top_by_margin: TopProductRow[];
};

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTopProductsPayload(payload: unknown): TopProductsPayload | null {
  // In some environments Supabase may return JSONB as a string; handle it explicitly.
  if (typeof payload === 'string') {
    try {
      return parseTopProductsPayload(JSON.parse(payload));
    } catch {
      return null;
    }
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const topByRevenueRaw = p.top_by_revenue;
  const topByMarginRaw = p.top_by_margin;
  if (!Array.isArray(topByRevenueRaw) || !Array.isArray(topByMarginRaw)) return null;

  function parseRow(row: unknown): TopProductRow | null {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
    const r = row as Record<string, unknown>;

    const product_id = typeof r.product_id === 'string' ? r.product_id : null;
    const label = typeof r.label === 'string' ? r.label : null;
    const revenue = asFiniteNumber(r.revenue);
    const avg_margin_pct = r.avg_margin_pct === null ? null : asFiniteNumber(r.avg_margin_pct);
    if (!product_id || !label || revenue === null) return null;
    return { product_id, label, revenue, avg_margin_pct };
  }

  const top_by_revenue = topByRevenueRaw
    .map(parseRow)
    .filter((x): x is TopProductRow => x !== null);

  const top_by_margin = topByMarginRaw
    .map(parseRow)
    .filter((x): x is TopProductRow => x !== null);

  return { top_by_revenue, top_by_margin };
}

export async function getDashboardKPIs(
  supabase: SupabaseClient,
): Promise<{ data: DashboardKPIs | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_dashboard_kpis');
  if (error) return { data: null, error: new Error(error.message) };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') return { data: null, error: null };

  const r = row as Record<string, unknown>;
  const total_revenue = asFiniteNumber(r.total_revenue);
  const total_expenses = asFiniteNumber(r.total_expenses);
  // Older `get_dashboard_kpis` (e.g. before inventory migration) omits this column; treat as 0.
  const inventory_value = asFiniteNumber(r.inventory_value) ?? 0;
  const gross_profit = asFiniteNumber(r.gross_profit);
  const cash_in_hand = asFiniteNumber(r.cash_in_hand);
  const online_received = asFiniteNumber(r.online_received);
  const average_sale_value = asFiniteNumber(r.average_sale_value);
  const sales_count = asFiniteNumber(r.sales_count);

  if (
    total_revenue === null ||
    total_expenses === null ||
    gross_profit === null ||
    cash_in_hand === null ||
    online_received === null ||
    average_sale_value === null ||
    sales_count === null
  ) {
    return { data: null, error: null };
  }

  return {
    data: {
      total_revenue,
      total_expenses,
      inventory_value,
      gross_profit,
      cash_in_hand,
      online_received,
      sales_count,
      average_sale_value,
    },
    error: null,
  };
}

export async function getTopProducts(
  supabase: SupabaseClient,
): Promise<{ data: TopProductsPayload | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_top_products');
  if (error) return { data: null, error: new Error(error.message) };

  const parsed = parseTopProductsPayload(data);
  if (!parsed) {
    return {
      data: null,
      error: new Error(
        "Invalid RPC response from `get_top_products` (expected JSONB object with `top_by_revenue` and `top_by_margin`).",
      ),
    };
  }

  return { data: parsed, error: null };
}

