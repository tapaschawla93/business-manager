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
  /**
   * When dashboard scope is **All tags**, operating expenses in range.
   * When a **single sale tag** is selected, **COGS**: sum of `quantity × cost_price_snapshot` on lines for sales in that tag (still returned as `total_expenses` for RPC shape).
   */
  total_expenses: number;
  /** Sum of `inventory_items.current_stock × unit_cost` for the tenant (point-in-time; not range-filtered). */
  inventory_value: number;
  /** Revenue minus the same counterparty total as `total_expenses` (expenses vs COGS by scope). */
  gross_profit: number;
  /** Cash sales minus cash-tagged portion of that counterparty total. */
  net_cash: number;
  /** Online sales minus online-tagged portion of that counterparty total. */
  net_online: number;
  /** net_cash + net_online for the period. */
  cash_in_hand_total: number;
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

export type MonthlyPerformanceRow = {
  month: number;
  year: number;
  revenue: number;
  /** Operating expenses per month (All tags) or monthly COGS for the scoped tag. */
  expenses: number;
  profit: number;
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

/** When set, KPIs (except inventory_value) scope to this `sale_tags.id`; `null` = all tags. */
export type DashboardTagFilter = string | null;

export async function getDashboardKPIs(
  supabase: SupabaseClient,
  range: DashboardDateRange,
  saleTagId: DashboardTagFilter = null,
): Promise<{ data: DashboardKPIs | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_dashboard_kpis', {
    p_from: range.from,
    p_to: range.to,
    p_sale_tag_id: saleTagId,
  });
  if (error) return { data: null, error: new Error(error.message) };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') {
    return {
      data: null,
      error: new Error(
        'Invalid RPC response from `get_dashboard_kpis` (expected one row with KPI fields).',
      ),
    };
  }

  const r = row as Record<string, unknown>;
  const total_revenue = asFiniteNumber(r.total_revenue);
  const total_expenses = asFiniteNumber(r.total_expenses);
  const inventory_value = asFiniteNumber(r.inventory_value) ?? 0;
  const gross_profit = asFiniteNumber(r.gross_profit);
  const net_cash = asFiniteNumber(r.net_cash);
  const net_online = asFiniteNumber(r.net_online);
  const cash_in_hand_total = asFiniteNumber(r.cash_in_hand_total);
  const average_sale_value = asFiniteNumber(r.average_sale_value);
  const sales_count = asFiniteNumber(r.sales_count);

  if (
    total_revenue === null ||
    total_expenses === null ||
    gross_profit === null ||
    net_cash === null ||
    net_online === null ||
    cash_in_hand_total === null ||
    average_sale_value === null ||
    sales_count === null
  ) {
    return {
      data: null,
      error: new Error(
        'Invalid or incomplete KPI row from `get_dashboard_kpis` (missing or non-numeric fields).',
      ),
    };
  }

  return {
    data: {
      total_revenue,
      total_expenses,
      inventory_value,
      gross_profit,
      net_cash,
      net_online,
      cash_in_hand_total,
      sales_count,
      average_sale_value,
    },
    error: null,
  };
}

export async function getTopProducts(
  supabase: SupabaseClient,
  range: DashboardDateRange,
  saleTagId: DashboardTagFilter = null,
): Promise<{ data: TopProductsPayload | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_top_products', {
    p_from: range.from,
    p_to: range.to,
    p_sale_tag_id: saleTagId,
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

export async function getMonthlyPerformance(
  supabase: SupabaseClient,
  range: DashboardDateRange,
  saleTagId: DashboardTagFilter = null,
): Promise<{ data: MonthlyPerformanceRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_monthly_performance', {
    p_from: range.from,
    p_to: range.to,
    p_sale_tag_id: saleTagId,
  });
  if (error) return { data: null, error: new Error(error.message) };
  if (!Array.isArray(data)) {
    return { data: null, error: new Error('Invalid RPC response from `get_monthly_performance`.') };
  }

  const rows: MonthlyPerformanceRow[] = [];
  for (const row of data) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return { data: null, error: new Error('Invalid monthly row payload.') };
    }
    const r = row as Record<string, unknown>;
    const month = asFiniteNumber(r.month);
    const year = asFiniteNumber(r.year);
    const revenue = asFiniteNumber(r.revenue);
    const expenses = asFiniteNumber(r.expenses);
    const profit = asFiniteNumber(r.profit);
    if (
      month === null ||
      year === null ||
      revenue === null ||
      expenses === null ||
      profit === null
    ) {
      return { data: null, error: new Error('Invalid monthly row fields from RPC.') };
    }
    rows.push({ month, year, revenue, expenses, profit });
  }
  return { data: rows, error: null };
}
