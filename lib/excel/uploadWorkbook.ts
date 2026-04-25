import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedWorkbook } from './parseWorkbook';
import { keyCustomers, keyExpenses, keyInventory, keyProducts, keySales, keyVendors } from './dedupeRules';
import { normalizeProductNameKey, normalizeProductVariantKey, resolveSaleProductId, saleProductLookupKey } from './resolveSaleProductId';

export type UploadSummary = {
  added: number;
  skipped: number;
  errors: Array<{ sheet: string; row: number; reason: string }>;
};

/** Shown when the upload had row-level errors: each sheet commits in order; earlier sheets are not rolled back. */
export const WORKBOOK_UPLOAD_PARTIAL_APPLY_NOTE =
  'Successful rows are already saved. Fix failed rows and re-upload if needed.';

/**
 * Imports workbook sheets in order (Products → Inventory → … → Sales → Expenses). Each insert/RPC commits
 * independently — a failure on a later sheet does not undo earlier sheets.
 */
export async function uploadWorkbook(
  supabase: SupabaseClient,
  wb: ParsedWorkbook,
): Promise<UploadSummary> {
  const summary: UploadSummary = { added: 0, skipped: 0, errors: [] };
  const { data: profile } = await supabase.from('profiles').select('business_id').single();
  const rawBid = profile?.business_id;
  if (typeof rawBid !== 'string' || rawBid.length === 0) {
    throw new Error('No business profile');
  }
  const businessId = rawBid;

  const { data: busRow } = await supabase
    .from('businesses')
    .select('default_sale_tag_id')
    .eq('id', businessId)
    .maybeSingle();
  const defaultSaleTagId = busRow?.default_sale_tag_id as string | undefined;

  const { data: tagRows } = await supabase
    .from('sale_tags')
    .select('id, label')
    .is('deleted_at', null)
    .order('label');
  const tagList = (tagRows ?? []) as { id: string; label: string }[];

  /** Empty, placeholder, or unknown → default when set; else match uuid or case-insensitive label. */
  function resolveSaleTagId(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s || s.startsWith('<')) return defaultSaleTagId ?? null;
    const byId = tagList.find((t) => t.id === s);
    if (byId) return byId.id;
    const lower = s.toLowerCase();
    const byLabel = tagList.find((t) => t.label.trim().toLowerCase() === lower);
    return byLabel?.id ?? null;
  }

  const [existingProducts, existingInventory, existingCustomers, existingVendors, existingSales, existingExpenses] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, name, category, variant')
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase.from('inventory_items').select('name'),
      supabase.from('customers').select('phone').is('deleted_at', null),
      supabase.from('vendors').select('name').is('deleted_at', null),
      supabase.from('sales').select('id').is('deleted_at', null),
      supabase.from('expenses').select('date, vendor_name, item_description, total_amount').is('deleted_at', null),
    ]);

  const productRows = (existingProducts.data ?? []) as { id: string; name: string; category: string; variant: string | null }[];
  const productKeys = new Set(productRows.map((p) => keyProducts(p)));
  /** Resolve sale lines by name+variant (preferred) and unique name fallback. */
  const productIdByNameVariant = new Map<string, string>();
  const nameToProductIds = new Map<string, Set<string>>();

  const registerProductLookup = (name: string, variant: string, id: string): void => {
    const nameKey = normalizeProductNameKey(name);
    const variantKey = normalizeProductVariantKey(variant);
    if (!nameKey) return;
    productIdByNameVariant.set(saleProductLookupKey(name, variantKey), id);
    const byName = nameToProductIds.get(nameKey) ?? new Set<string>();
    byName.add(id);
    nameToProductIds.set(nameKey, byName);
  };

  for (const p of productRows) {
    registerProductLookup(String(p.name ?? ''), String(p.variant ?? ''), p.id);
  }
  const uniqueProductIdByName = new Map<string, string>();
  for (const [nameKey, ids] of nameToProductIds.entries()) {
    if (ids.size === 1) {
      const [single] = Array.from(ids);
      if (single) uniqueProductIdByName.set(nameKey, single);
    }
  }
  const inventoryKeys = new Set(((existingInventory.data ?? []) as Record<string, unknown>[]).map(keyInventory));
  const customerKeys = new Set(
    ((existingCustomers.data ?? []) as Record<string, unknown>[])
      .map(keyCustomers)
      .filter((k) => k.length > 0),
  );
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
    const nameTrim = String(row.name ?? '').trim();
    const { data: insertedProduct, error } = await supabase
      .from('products')
      .insert({
        business_id: businessId,
        name: nameTrim,
        category: String(row.category ?? '').trim(),
        mrp: Number(row.mrp ?? 0),
        cost_price: Number(row.cost_price ?? 0),
        variant: String(row.variant ?? '').trim() || null,
      })
      .select('id')
      .single();
    if (error) summary.errors.push({ sheet: 'Products', row: i + 2, reason: error.message });
    else if (insertedProduct?.id) {
      productKeys.add(key);
      registerProductLookup(nameTrim, String(row.variant ?? '').trim(), insertedProduct.id);
      const nk = normalizeProductNameKey(nameTrim);
      if (nk) {
        const ids = nameToProductIds.get(nk) ?? new Set<string>();
        if (ids.size === 1) {
          const [single] = Array.from(ids);
          if (single) uniqueProductIdByName.set(nk, single);
        } else {
          uniqueProductIdByName.delete(nk);
        }
      }
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

  // 3) Customers — dedupe on digit-normalized key; persist trimmed source string as `phone`.
  for (let i = 0; i < wb.Customers.length; i++) {
    const row = wb.Customers[i];
    const phoneRaw = String(row.phone ?? '').trim();
    const key = keyCustomers(row);
    if (!key || customerKeys.has(key)) {
      summary.skipped += 1;
      continue;
    }
    const { error } = await supabase.from('customers').insert({
      business_id: businessId,
      name: String(row.name ?? '').trim(),
      phone: phoneRaw || null,
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
    const resolved = resolveSaleProductId(row, { productIdByNameVariant, uniqueProductIdByName });
    if (!resolved.ok) {
      summary.errors.push({ sheet: 'Sales', row: i + 2, reason: resolved.message });
      continue;
    }
    const productId = resolved.productId;
    const qty = Number(row.quantity ?? 0);
    const salePrice = Number(row.sale_price ?? 0);
    if (qty <= 0 || salePrice < 0) {
      summary.errors.push({ sheet: 'Sales', row: i + 2, reason: 'quantity/sale_price invalid' });
      continue;
    }
    const saleTagId = resolveSaleTagId(row.sale_tag_id);
    if (!saleTagId) {
      summary.errors.push({
        sheet: 'Sales',
        row: i + 2,
        reason: 'sale_tag_id missing or unknown (uuid, label, or empty for default)',
      });
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
      p_sale_tag_id: saleTagId,
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
    const expenseTagId = resolveSaleTagId(row.expense_tag_id);
    if (!expenseTagId) {
      summary.errors.push({
        sheet: 'Expenses',
        row: i + 2,
        reason: 'expense_tag_id missing or unknown (uuid, label, or empty for default)',
      });
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
      expense_tag_id: expenseTagId,
    });
    if (error) summary.errors.push({ sheet: 'Expenses', row: i + 2, reason: error.message });
    else {
      expenseKeys.add(key);
      summary.added += 1;
    }
  }

  return summary;
}
