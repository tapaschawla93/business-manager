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
    supabase.from('products').select('*').is('deleted_at', null),
    supabase.from('sales').select('*').is('deleted_at', null),
    supabase.from('sale_items').select('*'),
    supabase.from('expenses').select('*').is('deleted_at', null),
    supabase.from('inventory_items').select('*'),
    supabase.from('inventory').select('*'),
    supabase.from('vendors').select('*').is('deleted_at', null),
    supabase.from('customers').select('*').is('deleted_at', null),
  ]);

  const queryErrs = collectQueryErrors([
    { label: 'Profile', error: profileRes.error },
    { label: 'Products', error: productsRes.error },
    { label: 'Sales', error: salesRes.error },
    { label: 'Sale Items', error: saleItemsRes.error },
    { label: 'Expenses', error: expensesRes.error },
    { label: 'Inventory items', error: inventoryItemsRes.error },
    { label: 'Inventory ledger', error: inventoryLedgerRes.error },
    { label: 'Vendors', error: vendorsRes.error },
    { label: 'Customers', error: customersRes.error },
  ]);

  if (queryErrs.length > 0) {
    throw new Error(`Backup could not load all tables: ${queryErrs.join('; ')}`);
  }

  const { data: profile } = profileRes;
  const products = productsRes.data;
  const sales = salesRes.data;
  const saleItems = saleItemsRes.data;
  const expenses = expensesRes.data;
  const inventoryItems = inventoryItemsRes.data;
  const inventoryLedger = inventoryLedgerRes.data;
  const vendors = vendorsRes.data;
  const customers = customersRes.data;

  const wb = XLSX.utils.book_new();
  const append = (name: string, rows: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  append('Products', (products ?? []) as Record<string, unknown>[]);
  append('Sales', (sales ?? []) as Record<string, unknown>[]);
  append('Sale Items', (saleItems ?? []) as Record<string, unknown>[]);
  append('Expenses', (expenses ?? []) as Record<string, unknown>[]);
  append('Inventory', (inventoryItems ?? []) as Record<string, unknown>[]);
  append('Inventory Ledger', (inventoryLedger ?? []) as Record<string, unknown>[]);
  append('Vendors', (vendors ?? []) as Record<string, unknown>[]);
  append('Customers', (customers ?? []) as Record<string, unknown>[]);

  const businessName = safeBusinessName((profile as { businesses?: { name?: string } | null } | null)?.businesses?.name);
  XLSX.writeFile(wb, `${businessName}_Backup_${ddmmyyyy()}.xlsx`);
}
