import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer, CustomerListRow, CustomerOrderHistoryRow } from '@/lib/types/customer';

/**
 * Digits-only key for matching walk-in sales to saved customers when formatting differs.
 * Collapses common India forms: +91 prefix and leading 0 before a 10-digit mobile.
 */
export function normalizePhoneDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, '');
  if (d.length < 7) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(-10);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(-10);
  return d.length >= 7 ? d : null;
}

/**
 * Dedupe key for customer imports (CSV row and workbook row).
 * Prefer {@link normalizePhoneDigits} so +91 / leading 0 / spacing variants collide; if digits are too
 * short to normalize, uses trimmed raw string so behavior stays predictable.
 * Empty after trim → '' (caller treats as missing phone).
 */
export function customerPhoneDedupeKey(input: string | null | undefined): string {
  const t = String(input ?? '').trim();
  if (!t) return '';
  return normalizePhoneDigits(t) ?? t;
}

function normalizeCustomerNameKey(name: string | null | undefined): string | null {
  const t = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return t.length >= 2 ? t : null;
}

type SaleAggRaw = {
  id: string;
  customer_id: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  date: string;
  total_amount: number;
  payment_mode: 'cash' | 'online';
  customer_name: string | null;
  notes: string | null;
};

const SALES_PAGE_SIZE = 1000;

export async function fetchCustomersList(
  supabase: SupabaseClient,
): Promise<{ data: CustomerListRow[] | null; error: Error | null }> {
  const { data: customersRaw, error: customersErr } = await supabase
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (customersErr) return { data: null, error: new Error(customersErr.message) };
  const customers = (customersRaw ?? []) as Customer[];

  const sales: SaleAggRaw[] = [];
  let offset = 0;
  for (;;) {
    const { data: page, error: salesErr } = await supabase
      .from('sales')
      .select('id, customer_id, customer_name, customer_phone, customer_address, date, total_amount')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + SALES_PAGE_SIZE - 1);
    if (salesErr) return { data: null, error: new Error(salesErr.message) };
    if (!page?.length) break;
    sales.push(...(page as SaleAggRaw[]));
    if (page.length < SALES_PAGE_SIZE) break;
    offset += SALES_PAGE_SIZE;
  }

  type Agg = {
    customerId: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
    count: number;
    amount: number;
    lastDate: string | null;
    saleIds: string[];
  };
  const byKey = new Map<string, Agg>();
  const byId = new Map(customers.map((c) => [c.id, c] as const));
  /** Exact trimmed phone → customer (display / legacy). */
  const byPhone = new Map(customers.map((c) => [c.phone?.trim() ?? '', c] as const).filter(([k]) => !!k));
  /** Digits-only phone → customer so walk-in sales match saved customers even if formatting differs. */
  const customerByDigits = new Map<string, Customer>();
  for (const c of customers) {
    const d = normalizePhoneDigits(c.phone);
    if (d && !customerByDigits.has(d)) customerByDigits.set(d, c);
  }

  function aggregationKey(s: SaleAggRaw): string {
    if (s.customer_id) return `cid:${s.customer_id}`;
    const digits = normalizePhoneDigits(s.customer_phone);
    if (digits) {
      const linked = customerByDigits.get(digits);
      if (linked) return `cid:${linked.id}`;
      return `ph:${digits}`;
    }
    const nameKey = normalizeCustomerNameKey(s.customer_name);
    if (nameKey) return `nm:${nameKey}`;
    return `sale:${s.id}`;
  }

  for (const s of sales) {
    const key = aggregationKey(s);
    const phone = s.customer_phone?.trim() || null;
    const name = s.customer_name?.trim() || null;
    const current = byKey.get(key);
    const cidFromSale = s.customer_id ?? null;
    const digits = normalizePhoneDigits(s.customer_phone);
    const linkedByDigits = digits ? customerByDigits.get(digits) : undefined;
    const resolvedCustomerId = cidFromSale ?? linkedByDigits?.id ?? current?.customerId ?? null;

    byKey.set(key, {
      customerId: resolvedCustomerId,
      name: name ?? current?.name ?? null,
      phone: phone ?? current?.phone ?? null,
      address: (s.customer_address?.trim() || null) ?? current?.address ?? null,
      count: (current?.count ?? 0) + 1,
      amount: (current?.amount ?? 0) + Number(s.total_amount ?? 0),
      lastDate:
        !current?.lastDate || new Date(s.date).getTime() > new Date(current.lastDate).getTime()
          ? s.date
          : current.lastDate,
      saleIds: [...(current?.saleIds ?? []), s.id],
    });
  }

  const rows: CustomerListRow[] = [];
  for (const [key, agg] of byKey.entries()) {
    const aggDigits = normalizePhoneDigits(agg.phone);
    const linkedCustomer =
      (agg.customerId ? byId.get(agg.customerId) : undefined) ??
      (agg.phone ? byPhone.get(agg.phone) : undefined) ??
      (aggDigits ? customerByDigits.get(aggDigits) : undefined);

    rows.push({
      id: linkedCustomer?.id ?? `sales:${key}`,
      customerId: linkedCustomer?.id ?? null,
      name: linkedCustomer?.name ?? agg.name ?? 'Customer',
      phone: linkedCustomer?.phone ?? agg.phone,
      address: linkedCustomer?.address ?? agg.address,
      orderCount: agg.count,
      totalSpent: agg.amount,
      lastOrderDate: agg.lastDate,
      aggregatedSaleIds: agg.saleIds.length > 0 ? agg.saleIds : undefined,
    });
  }

  // Keep directory complete by including persisted customers with zero sales.
  for (const c of customers) {
    const exists = rows.some((r) => r.customerId === c.id);
    if (exists) continue;
    rows.push({
      id: c.id,
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      orderCount: 0,
      totalSpent: 0,
      lastOrderDate: null,
    });
  }

  rows.sort((a, b) => {
    const aTime = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
    const bTime = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
    return bTime - aTime;
  });

  return { data: rows, error: null };
}

export async function fetchCustomerOrderHistory(
  supabase: SupabaseClient,
  opts: {
    customerId: string | null;
    phone: string | null;
    name: string | null;
    saleIds?: string[] | null;
  },
): Promise<{ data: CustomerOrderHistoryRow[] | null; error: Error | null }> {
  const selectCols =
    'id, customer_id, customer_phone, date, total_amount, payment_mode, customer_name, notes';

  if (opts.saleIds && opts.saleIds.length > 0) {
    const { data, error } = await supabase
      .from('sales')
      .select(selectCols)
      .in('id', opts.saleIds)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    if (error) return { data: null, error: new Error(error.message) };
    const rows = ((data ?? []) as SaleAggRaw[]).map((s) => ({
      saleId: s.id,
      date: s.date,
      amount: Number(s.total_amount),
      paymentMode: s.payment_mode,
      customerName: s.customer_name,
      notes: s.notes,
    }));
    return { data: rows, error: null };
  }

  const baseQuery = () =>
    supabase.from('sales').select(selectCols).is('deleted_at', null).order('date', { ascending: false });

  const requests = [];
  if (opts.customerId) requests.push(baseQuery().eq('customer_id', opts.customerId));
  if (opts.phone) requests.push(baseQuery().eq('customer_phone', opts.phone));
  if (!opts.phone && opts.name) requests.push(baseQuery().eq('customer_name', opts.name));
  if (requests.length === 0) return { data: [], error: null };

  const results = await Promise.all(requests);
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return { data: null, error: new Error(firstErr.message) };

  const merged = new Map<string, SaleAggRaw>();
  for (const r of results) {
    for (const row of (r.data ?? []) as SaleAggRaw[]) {
      merged.set(row.id, row);
    }
  }

  const phoneDigits = normalizePhoneDigits(opts.phone);
  let list = Array.from(merged.values());
  if (phoneDigits && opts.phone) {
    list = list.filter(
      (s) =>
        normalizePhoneDigits(s.customer_phone) === phoneDigits ||
        (opts.customerId != null && s.customer_id === opts.customerId),
    );
  }

  const rows = list.map((s) => ({
    saleId: s.id,
    date: s.date,
    amount: Number(s.total_amount),
    paymentMode: s.payment_mode,
    customerName: s.customer_name,
    notes: s.notes,
  }));
  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { data: rows, error: null };
}
