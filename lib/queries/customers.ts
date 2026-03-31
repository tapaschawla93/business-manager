import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer, CustomerListRow, CustomerOrderHistoryRow } from '@/lib/types/customer';

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

export async function fetchCustomersList(
  supabase: SupabaseClient,
): Promise<{ data: CustomerListRow[] | null; error: Error | null }> {
  const [{ data: customersRaw, error: customersErr }, { data: salesRaw, error: salesErr }] =
    await Promise.all([
      supabase.from('customers').select('*').is('deleted_at', null).order('name', { ascending: true }),
      supabase
        .from('sales')
        .select('id, customer_id, customer_name, customer_phone, customer_address, date, total_amount')
        .is('deleted_at', null),
    ]);

  if (customersErr) return { data: null, error: new Error(customersErr.message) };
  if (salesErr) return { data: null, error: new Error(salesErr.message) };
  const customers = (customersRaw ?? []) as Customer[];
  const sales = (salesRaw ?? []) as SaleAggRaw[];

  type Agg = {
    customerId: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
    count: number;
    amount: number;
    lastDate: string | null;
  };
  const byKey = new Map<string, Agg>();
  const byId = new Map(customers.map((c) => [c.id, c] as const));
  const byPhone = new Map(customers.map((c) => [c.phone?.trim() ?? '', c] as const).filter(([k]) => !!k));

  for (const s of sales) {
    const phone = s.customer_phone?.trim() || null;
    const name = s.customer_name?.trim() || null;
    const key = s.customer_id ? `id:${s.customer_id}` : phone ? `phone:${phone}` : `sale:${s.id}`;
    if (!key) continue;

    const current = byKey.get(key);
    byKey.set(key, {
      customerId: s.customer_id ?? current?.customerId ?? null,
      name: name ?? current?.name ?? null,
      phone: phone ?? current?.phone ?? null,
      address: (s.customer_address?.trim() || null) ?? current?.address ?? null,
      count: (current?.count ?? 0) + 1,
      amount: (current?.amount ?? 0) + Number(s.total_amount ?? 0),
      lastDate:
        !current?.lastDate || new Date(s.date).getTime() > new Date(current.lastDate).getTime()
          ? s.date
          : current.lastDate,
    });
  }

  const rows: CustomerListRow[] = [];
  for (const [key, agg] of byKey.entries()) {
    const linkedCustomer =
      (agg.customerId ? byId.get(agg.customerId) : undefined) ??
      (agg.phone ? byPhone.get(agg.phone) : undefined);

    rows.push({
      id: linkedCustomer?.id ?? `sales:${key}`,
      customerId: linkedCustomer?.id ?? null,
      name: linkedCustomer?.name ?? agg.name ?? 'Customer',
      phone: linkedCustomer?.phone ?? agg.phone,
      address: linkedCustomer?.address ?? agg.address,
      orderCount: agg.count,
      totalSpent: agg.amount,
      lastOrderDate: agg.lastDate,
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
  opts: { customerId: string | null; phone: string | null; name: string | null },
): Promise<{ data: CustomerOrderHistoryRow[] | null; error: Error | null }> {
  const baseQuery = () =>
    supabase
      .from('sales')
      .select('id, customer_id, customer_phone, date, total_amount, payment_mode, customer_name, notes')
      .is('deleted_at', null)
      .order('date', { ascending: false });

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

  const rows = Array.from(merged.values()).map((s) => ({
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
