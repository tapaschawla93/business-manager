import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';

function safeBusinessName(n: string | null | undefined): string {
  const raw = (n ?? 'Business').trim() || 'Business';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function ddmmyyyy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function collectQueryErrors(
  pairs: Array<{ label: string; error: { message: string } | null }>,
): string[] {
  return pairs
    .filter((p) => p.error)
    .map((p) => `${p.label}: ${p.error!.message}`);
}

/** YYYY-MM-DD for sales `date` and workbook Sales sheet. */
function ymdFromDb(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Expense/workbook row: date only string. */
function ymdFromExpenseDate(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v);
  if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : s;
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  mrp: number | string;
  cost_price: number | string;
  variant: string | null;
};

type SaleRow = {
  id: string;
  date: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  sale_type: string | null;
  payment_mode: string;
  notes: string | null;
  sale_tag_id: string | null;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number | string;
  sale_price: number | string;
};

/**
 * Full tenant backup as `.xlsx`. Tab shapes match `parseWorkbook` / `uploadWorkbook` so the same file
 * can be used with **Restore** on the dashboard (merge + skip rules apply; not a wipe-replace).
 * **Inventory Ledger** is informational only (not read on import). **Sale Items** tab is omitted — each
 * sale line is a row in **Sales** (`restore:{saleId}:{lineId}` ids). Missing sheets parse as empty.
 */
export async function downloadBackupWorkbook(supabase: SupabaseClient): Promise<void> {
  const [
    profileRes,
    productsRes,
    salesRes,
    saleItemsRes,
    expensesRes,
    inventoryItemsRes,
    inventoryLedgerRes,
    vendorsRes,
    customersRes,
  ] = await Promise.all([
    supabase.from('profiles').select('businesses(name)').single(),
    supabase.from('products').select('id, name, category, mrp, cost_price, variant').is('deleted_at', null),
    supabase.from('sales').select('id, date, customer_name, customer_phone, customer_address, sale_type, payment_mode, notes, sale_tag_id').is('deleted_at', null),
    supabase.from('sale_items').select('id, sale_id, product_id, quantity, sale_price'),
    supabase
      .from('expenses')
      .select('date, vendor_name, item_description, quantity, unit_cost, total_amount, payment_mode, expense_tag_id')
      .is('deleted_at', null),
    supabase.from('inventory_items').select('name, unit, current_stock, unit_cost, reorder_level'),
    supabase.from('inventory').select('*'),
    supabase.from('vendors').select('name, contact_person, phone, address, notes, email').is('deleted_at', null),
    supabase.from('customers').select('name, phone, address').is('deleted_at', null),
  ]);

  const queryErrs = collectQueryErrors([
    { label: 'Profile', error: profileRes.error },
    { label: 'Products', error: productsRes.error },
    { label: 'Sales', error: salesRes.error },
    { label: 'Sale Items', error: saleItemsRes.error },
    { label: 'Expenses', error: expensesRes.error },
    { label: 'Inventory items', error: inventoryItemsRes.error },
    { label: 'Inventory ledger', error: inventoryLedgerRes.error },
    { label: 'Customers', error: customersRes.error },
    { label: 'Vendors', error: vendorsRes.error },
  ]);

  if (queryErrs.length > 0) {
    throw new Error(`Backup could not load all tables: ${queryErrs.join('; ')}`);
  }

  const { data: profile } = profileRes;
  const products = (productsRes.data ?? []) as ProductRow[];
  const sales = (salesRes.data ?? []) as SaleRow[];
  const saleItems = (saleItemsRes.data ?? []) as SaleItemRow[];
  const expenses = expensesRes.data ?? [];
  const inventoryItems = inventoryItemsRes.data ?? [];
  const inventoryLedger = inventoryLedgerRes.data ?? [];
  const customers = customersRes.data ?? [];
  const vendors = vendorsRes.data ?? [];

  const saleIdSet = new Set(sales.map((s) => s.id));
  const productById = new Map(products.map((p) => [p.id, p]));
  const saleById = new Map(sales.map((s) => [s.id, s]));

  const flatSales: Record<string, unknown>[] = [];
  for (const si of saleItems) {
    if (!saleIdSet.has(si.sale_id)) continue;
    const sale = saleById.get(si.sale_id);
    if (!sale) continue;
    const prod = productById.get(si.product_id);
    flatSales.push({
      id: `restore:${sale.id}:${si.id}`,
      date: ymdFromDb(sale.date),
      customer_name: sale.customer_name ?? '',
      customer_phone: sale.customer_phone ?? '',
      customer_address: sale.customer_address ?? '',
      sale_type: sale.sale_type ?? '',
      payment_mode: sale.payment_mode,
      notes: sale.notes ?? '',
      sale_tag_id: sale.sale_tag_id ?? '',
      product_id: si.product_id,
      product_name: prod?.name ?? '',
      quantity: si.quantity,
      sale_price: si.sale_price,
    });
  }
  flatSales.sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)),
  );

  const wb = XLSX.utils.book_new();
  const append = (name: string, rows: Record<string, unknown>[]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  };

  append(
    'Products',
    products.map((p) => ({
      name: p.name,
      category: p.category,
      mrp: p.mrp,
      cost_price: p.cost_price,
      variant: p.variant ?? '',
    })) as Record<string, unknown>[],
  );
  append('Sales', flatSales);
  append(
    'Expenses',
    (expenses as Record<string, unknown>[]).map((e) => ({
      date: ymdFromExpenseDate(e.date),
      vendor_name: e.vendor_name ?? '',
      item_description: e.item_description ?? '',
      quantity: e.quantity ?? 0,
      unit_cost: e.unit_cost ?? 0,
      total_amount: e.total_amount ?? 0,
      payment_mode: e.payment_mode ?? 'cash',
      expense_tag_id: e.expense_tag_id ?? '',
    })),
  );
  append(
    'Inventory',
    (inventoryItems as Record<string, unknown>[]).map((r) => ({
      name: r.name ?? '',
      unit: r.unit ?? 'pcs',
      current_stock: r.current_stock ?? 0,
      unit_cost: r.unit_cost ?? 0,
      reorder_level: r.reorder_level ?? '',
    })),
  );
  append('Inventory Ledger', (inventoryLedger ?? []) as Record<string, unknown>[]);
  append(
    'Vendors',
    (vendors as Record<string, unknown>[]).map((v) => ({
      name: v.name ?? '',
      contact_person: v.contact_person ?? '',
      phone: v.phone ?? '',
      address: v.address ?? '',
      notes: v.notes ?? '',
      email: v.email ?? '',
    })),
  );
  append(
    'Customers',
    (customers as Record<string, unknown>[]).map((c) => ({
      name: c.name ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
    })),
  );

  const businessName = safeBusinessName((profile as { businesses?: { name?: string } | null } | null)?.businesses?.name);
  XLSX.writeFile(wb, `${businessName}_Backup_${ddmmyyyy()}.xlsx`);
}
