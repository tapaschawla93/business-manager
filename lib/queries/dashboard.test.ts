import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultDashboardYtdRange,
  getDashboardKPIs,
  getMonthlyPerformance,
  getTopProducts,
} from '@/lib/queries/dashboard';

const range = { from: '2026-01-01', to: '2026-01-31' };

function kpiRow(overrides: Record<string, unknown> = {}) {
  return {
    total_revenue: 100,
    total_expenses: 40,
    inventory_value: 10,
    gross_profit: 60,
    net_cash: 30,
    net_online: 30,
    cash_in_hand_total: 60,
    sales_count: 5,
    average_sale_value: 20,
    ...overrides,
  };
}

describe('defaultDashboardYtdRange', () => {
  it('returns from/to as YYYY-MM-DD and from is Jan 1 of current year', () => {
    const r = defaultDashboardYtdRange();
    expect(r.from).toMatch(/^\d{4}-01-01$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.from <= r.to).toBe(true);
  });
});

describe('getDashboardKPIs', () => {
  it('maps a valid RPC row to DashboardKPIs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [kpiRow()], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getDashboardKPIs(supabase, range, null);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_kpis', {
      p_from: range.from,
      p_to: range.to,
      p_sale_tag_id: null,
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({
      total_revenue: 100,
      total_expenses: 40,
      inventory_value: 10,
      gross_profit: 60,
      net_cash: 30,
      net_online: 30,
      cash_in_hand_total: 60,
      sales_count: 5,
      average_sale_value: 20,
    });
  });

  it('passes sale tag id when scoped', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [kpiRow()], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const tag = '550e8400-e29b-41d4-a716-446655440000';
    await getDashboardKPIs(supabase, range, tag);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_kpis', {
      p_from: range.from,
      p_to: range.to,
      p_sale_tag_id: tag,
    });
  });

  it('returns error when a required numeric field is missing', async () => {
    const row = kpiRow();
    delete (row as { net_cash?: number }).net_cash;
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getDashboardKPIs(supabase, range, null);
    expect(res.data).toBeNull();
    expect(res.error?.message).toMatch(/Invalid or incomplete KPI row/);
  });

  it('surfaces Postgrest RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid sale tag' } });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getDashboardKPIs(supabase, range, 'bad');
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('Invalid sale tag');
  });
});

describe('getTopProducts', () => {
  it('parses valid JSONB payload', async () => {
    const payload = {
      top_by_revenue: [{ product_id: 'a', label: 'A', revenue: 1, avg_margin_pct: 10 }],
      top_by_margin: [{ product_id: 'b', label: 'B', revenue: 2, avg_margin_pct: null }],
      top_by_volume: [{ product_id: 'c', label: 'C', quantity_sold: 3, revenue: 4 }],
      sales_by_category: [{ category: 'x', revenue: 5 }],
    };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getTopProducts(supabase, range, null);
    expect(res.error).toBeNull();
    expect(res.data?.top_by_revenue[0]?.label).toBe('A');
    expect(res.data?.sales_by_category[0]?.revenue).toBe(5);
  });

  it('rejects malformed payload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { top_by_revenue: [] }, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getTopProducts(supabase, range, null);
    expect(res.data).toBeNull();
    expect(res.error?.message).toMatch(/Invalid RPC response from `get_top_products`/);
  });
});

describe('getMonthlyPerformance', () => {
  it('parses row array from RPC', async () => {
    const rows = [
      { month: 1, year: 2026, revenue: 100, expenses: 20, profit: 80 },
      { month: 2, year: 2026, revenue: 50, expenses: 10, profit: 40 },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getMonthlyPerformance(supabase, range, null);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2);
    expect(res.data?.[1]?.profit).toBe(40);
  });

  it('returns error when data is not an array', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const res = await getMonthlyPerformance(supabase, range, null);
    expect(res.data).toBeNull();
    expect(res.error?.message).toMatch(/Invalid RPC response from `get_monthly_performance`/);
  });
});
