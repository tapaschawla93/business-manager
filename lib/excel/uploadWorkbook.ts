import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedWorkbook } from './parseWorkbook';
import { keyCustomers, keyExpenses, keyInventory, keyProducts, keySales, keyVendors } from './dedupeRules';

export type UploadSummary = {
  added: number;
  skipped: number;
  errors: Array<{ sheet: string; row: number; reason: string }>;
};

export async function uploadWorkbook(
  supabase: SupabaseClient,
  wb: ParsedWorkbook,
): Promise<UploadSummary> {
  const summary: UploadSummary = { added: 0, skipped: 0, errors: [] };
  const { data: profile } = await supabase.from('profiles').select('business_id').single();
  const businessId = profile?.business_id as string | undefined;
  if (!businessId) throw new Error('No business profile');

  const [existingProducts, existingInventory, existingCustomers, existingVendors, existingSales, existingExpenses] =
    await Promise.all([
      supabase.from('products').select('name, category').is('deleted_at', null),
      supabase.from('inventory_items').select('name'),
      supabase.from('customers').select('phone').is('deleted_at', null),
      supabase.from('vendors').select('name').is('deleted_at', null),
      supabase.from('sales').select('id').is('deleted_at', null),
      supabase.from('expenses').select('date, vendor_name, item_description, total_amount').is('deleted_at', null),
    ]);

  const productKeys = new Set(((existingProducts.data ?? []) as Record<string, unknown>[]).map(keyProducts));
  const inventoryKeys = new Set(((existingInventory.data ?? []) as Record<string, unknown>[]).map(keyInventory));
  const customerKeys = new Set(((existingCustomers.data ?? []) as Record<string, unknown>[]).map(keyCustomers));
  const vendorKeys = new Set(((existingVendors.data ?? []) as Record<string, unknown>[]).map(keyVendors));
  const salesKeys = new Set(((existingSales.data ?? []) as Record<string, unknown>[]).map(keySales));
  const expenseKeys = new Set(((existingExpenses.data ?? []) as Record<string, unknown>[]).map(keyExpenses));

  // 1) Products
  for (let i = 0; i < wb.Products.length; i++) {
    const row = wb.Products[i];
    const key = keyProducts(row);
    if (!key || productKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('products').insert({
      business_id: businessId,
      name: String(row.name ?? '').trim(),
      category: String(row.category ?? '').trim(),
      mrp: Number(row.mrp ?? 0),
      cost_price: Number(row.cost_price ?? 0),
      variant: String(row.variant ?? '').trim() || null,
    });
    if (error) summary.errors.push({ sheet: 'Products', row: i + 2, reason: error.message });
    else {
      productKeys.add(key);
      summary.added += 1;
    }
  }

  // 2) Inventory
  for (let i = 0; i < wb.Inventory.length; i++) {
    const row = wb.Inventory[i];
    const key = keyInventory(row);
    if (!key || inventoryKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('inventory_items').insert({
      business_id: businessId,
      name: String(row.name ?? '').trim(),
      unit: String(row.unit ?? 'pcs').trim() || 'pcs',
      current_stock: Number(row.current_stock ?? 0),
      unit_cost: Number(row.unit_cost ?? 0),
      reorder_level: row.reorder_level === '' ? null : Number(row.reorder_level ?? 0),
    });
    if (error) summary.errors.push({ sheet: 'Inventory', row: i + 2, reason: error.message });
    else {
      inventoryKeys.add(key);
      summary.added += 1;
    }
  }

  // 3) Customers
  for (let i = 0; i < wb.Customers.length; i++) {
    const row = wb.Customers[i];
    const key = keyCustomers(row);
    if (!key || customerKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('customers').insert({
      business_id: businessId,
      name: String(row.name ?? '').trim(),
      phone: key || null,
      address: String(row.address ?? '').trim() || null,
    });
    if (error) summary.errors.push({ sheet: 'Customers', row: i + 2, reason: error.message });
    else {
      customerKeys.add(key);
      summary.added += 1;
    }
  }

  // 4) Vendors
  for (let i = 0; i < wb.Vendors.length; i++) {
    const row = wb.Vendors[i];
    const key = keyVendors(row);
    if (!key || vendorKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('vendors').insert({
      business_id: businessId,
      name: String(row.name ?? '').trim(),
      contact_person: String(row.contact_person ?? '').trim() || null,
      phone: String(row.phone ?? '').trim() || null,
      address: String(row.address ?? '').trim() || null,
      notes: String(row.notes ?? '').trim() || null,
      email: String(row.email ?? '').trim() || null,
    });
    if (error) summary.errors.push({ sheet: 'Vendors', row: i + 2, reason: error.message });
    else {
      vendorKeys.add(key);
      summary.added += 1;
    }
  }

  // 5) Sales (append-only by id key; insert via save_sale)
  for (let i = 0; i < wb.Sales.length; i++) {
    const row = wb.Sales[i];
    const key = keySales(row);
    if (!key || salesKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const productId = String(row.product_id ?? '').trim();
    const qty = Number(row.quantity ?? 0);
    const salePrice = Number(row.sale_price ?? 0);
    if (!productId || qty <= 0 || salePrice < 0) {
      summary.errors.push({ sheet: 'Sales', row: i + 2, reason: 'product_id/quantity/sale_price invalid' });
      continue;
    }
    const { error } = await supabase.rpc('save_sale', {
      p_date: String(row.date ?? ''),
      p_customer_name: String(row.customer_name ?? '').trim() || null,
      p_customer_phone: String(row.customer_phone ?? '').trim() || null,
      p_customer_address: String(row.customer_address ?? '').trim() || null,
      p_sale_type: String(row.sale_type ?? '').trim() || null,
      p_payment_mode: String(row.payment_mode ?? '').trim().toLowerCase(),
      p_notes: String(row.notes ?? '').trim() || null,
      p_lines: [{ product_id: productId, quantity: qty, sale_price: salePrice }],
    });
    if (error) summary.errors.push({ sheet: 'Sales', row: i + 2, reason: error.message });
    else {
      salesKeys.add(key);
      summary.added += 1;
    }
  }

  // 6) Expenses
  for (let i = 0; i < wb.Expenses.length; i++) {
    const row = wb.Expenses[i];
    const key = keyExpenses(row);
    if (!key || expenseKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('expenses').insert({
      business_id: businessId,
      date: String(row.date ?? ''),
      vendor_name: String(row.vendor_name ?? '').trim(),
      item_description: String(row.item_description ?? '').trim(),
      quantity: Number(row.quantity ?? 0),
      unit_cost: Number(row.unit_cost ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      payment_mode: String(row.payment_mode ?? 'cash').trim().toLowerCase(),
      update_inventory: false,
    });
    if (error) summary.errors.push({ sheet: 'Expenses', row: i + 2, reason: error.message });
    else {
      expenseKeys.add(key);
      summary.added += 1;
    }
  }

  return summary;
}
