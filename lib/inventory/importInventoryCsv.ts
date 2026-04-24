import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/lib/types/product';
import {
  buildImportIssuesCsv,
  getOptionalNumber,
  getRequiredNumber,
  getString,
  type CsvRow,
  type ImportIssue,
} from '@/lib/importCsv';
import {
  buildProductLookupMap,
  PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE,
  resolveProductLookup,
  type ProductLookupResolution,
} from '@/lib/productLookupMap';
function productDisplayName(p: Pick<Product, 'name' | 'variant'>): string {
  const n = p.name.trim();
  const v = (p.variant ?? '').trim();
  return v ? `${n} · ${v}` : n;
}

export type InventoryImportResult = { inserted: number; issues: ImportIssue[] };

/**
 * Row-by-row insert into `inventory_items`. Rebuilds lookup index only after a stub product
 * is appended (O(rows × products) worst case → O(products) per row + rebuilds on stubs only).
 */
export async function importInventoryCsvRows(
  supabase: SupabaseClient,
  businessId: string,
  rows: CsvRow[],
  initialProducts: Pick<Product, 'id' | 'name' | 'variant'>[],
): Promise<InventoryImportResult> {
  const issues: ImportIssue[] = [];
  let inserted = 0;
  let products = [...initialProducts];
  let lookupIndex = buildProductLookupMap(products);

  for (let idx = 0; idx < rows.length; idx += 1) {
    const r = rows[idx]!;
    const rowNo = idx + 2;
    const name = getString(r, 'name');
    const unitRaw = getString(r, 'unit');
    const unit = unitRaw === '' ? 'pcs' : unitRaw;
    const stock = getRequiredNumber(r, 'current_stock');
    const cost = getRequiredNumber(r, 'unit_cost');
    const reorder = getOptionalNumber(r, 'reorder_level');
    const lookupRaw = getString(r, 'product_lookup');
    const productName = getString(r, 'product_name');
    const variant = getString(r, 'variant');
    const derivedLookup = productName ? `${productName}${variant ? `::${variant}` : ''}` : '';
    const effectiveLookup = lookupRaw || derivedLookup;

    if (!effectiveLookup) {
      issues.push({
        row: rowNo,
        field: 'product_lookup',
        message: "required (use 'product_lookup' = name or name::variant, or use 'product_name' + optional 'variant')",
      });
    }
    if (stock === null || stock < 0) issues.push({ row: rowNo, field: 'current_stock', message: 'must be >= 0 number' });
    if (cost === null || cost < 0) issues.push({ row: rowNo, field: 'unit_cost', message: 'must be >= 0 number' });
    if (reorder !== null && reorder < 0) issues.push({ row: rowNo, field: 'reorder_level', message: 'must be >= 0 if set' });

    const resolved: ProductLookupResolution = effectiveLookup
      ? resolveProductLookup(lookupIndex, effectiveLookup)
      : { productId: null, ambiguous: false };
    let productId = resolved.productId;

    if (resolved.ambiguous) {
      issues.push({ row: rowNo, field: 'product_lookup', message: PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE });
    }

    if (effectiveLookup && !resolved.ambiguous && !productId) {
      issues.push({ row: rowNo, field: 'product_lookup', message: 'no matching product (add it in Products first)' });
    }

    if (stock === null || stock < 0 || cost === null || cost < 0 || (reorder !== null && reorder < 0)) {
      continue;
    }
    if (resolved.ambiguous) {
      continue;
    }
    if (effectiveLookup && !productId) {
      continue;
    }

    const product = productId ? products.find((p) => p.id === productId) : null;
    const finalName = product ? productDisplayName(product) : name.trim();
    if (!finalName) {
      issues.push({ row: rowNo, field: 'name', message: 'could not determine inventory line name' });
      continue;
    }

    const { error: insErr } = await supabase.from('inventory_items').insert({
      business_id: businessId,
      name: finalName,
      unit,
      current_stock: stock,
      unit_cost: cost,
      reorder_level: reorder,
      product_id: productId,
    });

    if (insErr) {
      issues.push({ row: rowNo, field: 'row', message: insErr.message });
    } else {
      inserted += 1;
    }
  }

  return { inserted, issues };
}

export function inventoryImportIssuesCsv(issues: ImportIssue[]): string {
  return buildImportIssuesCsv(issues);
}
