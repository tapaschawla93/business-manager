import type { SupabaseClient } from '@supabase/supabase-js';
import type { Expense } from '@/lib/types/expense';

/** Inclusive filter on `expenses.date` (ISO strings for timestamptz). */
export type ExpenseSummaryRange = {
  startIso: string;
  endIso: string;
};

/**
 * Active expenses for current tenant (RLS). Optional `businessId` for `.eq` defense-in-depth.
 */
export async function fetchActiveExpenses(
  supabase: SupabaseClient,
  options?: { businessId?: string },
): Promise<{ data: Expense[] | null; error: Error | null }> {
  let q = supabase
    .from('expenses')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options?.businessId) {
    q = q.eq('business_id', options.businessId);
  }

  const { data, error } = await q;
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  const rows = (data ?? []) as Expense[];
  return {
    data: rows.map((row) => ({
      ...row,
      category: row.category ?? null,
    })),
    error: null,
  };
}

/**
 * Sums `total_amount` by payment mode over active rows. `range` filters `date` inclusively.
 */
export async function getExpenseSummary(
  supabase: SupabaseClient,
  businessId: string,
  range?: ExpenseSummaryRange,
): Promise<{
  data: {
    total_expenses: number;
    cash_expenses: number;
    online_expenses: number;
  } | null;
  error: Error | null;
}> {
  let q = supabase
    .from('expenses')
    .select('payment_mode, total_amount')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (range) {
    q = q.gte('date', range.startIso).lte('date', range.endIso);
  }

  const { data, error } = await q;
  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  let total = 0;
  let cash = 0;
  let online = 0;
  for (const row of data ?? []) {
    const amt = Number((row as { total_amount: number }).total_amount);
    if (!Number.isFinite(amt)) continue;
    total += amt;
    const mode = (row as { payment_mode: string }).payment_mode;
    if (mode === 'cash') cash += amt;
    else if (mode === 'online') online += amt;
  }

  return {
    data: {
      total_expenses: Math.round(total * 100) / 100,
      cash_expenses: Math.round(cash * 100) / 100,
      online_expenses: Math.round(online * 100) / 100,
    },
    error: null,
  };
}
