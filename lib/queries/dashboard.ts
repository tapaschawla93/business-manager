import type { SupabaseClient } from '@supabase/supabase-js';

/** Inclusive `YYYY-MM-DD` bounds aligned with `sales.date` (local calendar). */
export type DashboardDateRange = {
  from: string;
  to: string;
};

/** Default dashboard window: Jan 1 — today in the browser’s local calendar. */
export function defaultDashboardYtdRange(): DashboardDateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-01-01`, to: `${y}-${m}-${d}` };
}

export type DashboardKPIs = {
  total_revenue: number;
  total_expenses: number;
  /** Current stock × catalog cost (point-in-time; not filtered by dashboard range). */
  inventory_value: number;
  /** Revenue − expenses in the selected period. */
  gross_profit: number;
  /** Sale totals with `payment_mode = 'cash'` in range. */
  cash_collected: number;
  /** Sale totals with `payment_mode = 'online'` in range. */
  online_collected: number;
  sales_count: number;
  average_sale_value: number;
};

export type TopProductRow = {
  product_id: string;
  label: string;
  revenue: number;
  avg_margin_pct: number | null;
};

export type TopProductVolumeRow = {
  product_id: string;
  label: string;
  quantity_sold: number;
  revenue: number;
};

export type CategorySalesRow = {
  category: string;
  revenue: number;
};

export type TopProductsPayload = {
  top_by_revenue: TopProductRow[];
  top_by_margin: TopProductRow[];
  top_by_volume: TopProductVolumeRow[];
  sales_by_category: CategorySalesRow[];
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
  const topByVolumeRaw = p.top_by_volume;
  const salesByCategoryRaw = p.sales_by_category;
  if (
    !Array.isArray(topByRevenueRaw) ||
    !Array.isArray(topByMarginRaw) ||
    !Array.isArray(topByVolumeRaw) ||
    !Array.isArray(salesByCategoryRaw)
  ) {
    return null;
  }

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

  function parseVolumeRow(row: unknown): TopProductVolumeRow | null {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
    const r = row as Record<string, unknown>;
    const product_id = typeof r.product_id === 'string' ? r.product_id : null;
    const label = typeof r.label === 'string' ? r.label : null;
    const quantity_sold = asFiniteNumber(r.quantity_sold);
    const revenue = asFiniteNumber(r.revenue);
    if (!product_id || !label || quantity_sold === null || revenue === null) return null;
    return { product_id, label, quantity_sold, revenue };
  }

  function parseCategoryRow(row: unknown): CategorySalesRow | null {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
    const r = row as Record<string, unknown>;
    const category = typeof r.category === 'string' ? r.category : null;
    const revenue = asFiniteNumber(r.revenue);
    if (!category || revenue === null) return null;
    return { category, revenue };
  }

  const top_by_revenue = topByRevenueRaw
    .map(parseRow)
    .filter((x): x is TopProductRow => x !== null);

  const top_by_margin = topByMarginRaw
    .map(parseRow)
    .filter((x): x is TopProductRow => x !== null);

  const top_by_volume = topByVolumeRaw
    .map(parseVolumeRow)
    .filter((x): x is TopProductVolumeRow => x !== null);

  const sales_by_category = salesByCategoryRaw
    .map(parseCategoryRow)
    .filter((x): x is CategorySalesRow => x !== null);

  return { top_by_revenue, top_by_margin, top_by_volume, sales_by_category };
}

export async function getDashboardKPIs(
  supabase: SupabaseClient,
  range: DashboardDateRange,
): Promise<{ data: DashboardKPIs | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_dashboard_kpis', {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) return { data: null, error: new Error(error.message) };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') return { data: null, error: null };

  const r = row as Record<string, unknown>;
  const total_revenue = asFiniteNumber(r.total_revenue);
  const total_expenses = asFiniteNumber(r.total_expenses);
  const inventory_value = asFiniteNumber(r.inventory_value) ?? 0;
  const gross_profit = asFiniteNumber(r.gross_profit);
  const cash_collected = asFiniteNumber(r.cash_collected);
  const online_collected = asFiniteNumber(r.online_collected);
  const average_sale_value = asFiniteNumber(r.average_sale_value);
  const sales_count = asFiniteNumber(r.sales_count);

  if (
    total_revenue === null ||
    total_expenses === null ||
    gross_profit === null ||
    cash_collected === null ||
    online_collected === null ||
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
      cash_collected,
      online_collected,
      sales_count,
      average_sale_value,
    },
    error: null,
  };
}

export async function getTopProducts(
  supabase: SupabaseClient,
  range: DashboardDateRange,
): Promise<{ data: TopProductsPayload | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_top_products', {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) return { data: null, error: new Error(error.message) };

  const parsed = parseTopProductsPayload(data);
  if (!parsed) {
    return {
      data: null,
      error: new Error(
        'Invalid RPC response from `get_top_products` (expected JSONB with top_by_revenue, top_by_margin, top_by_volume, sales_by_category).',
      ),
    };
  }

  return { data: parsed, error: null };
}
