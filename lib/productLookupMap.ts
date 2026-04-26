import type { Product } from '@/lib/types/product';

/** Shown when two or more catalog rows share the same `product_lookup` key. */
export const PRODUCT_LOOKUP_AMBIGUOUS_MESSAGE =
  'multiple products match; use variant column or product_lookup as name::variant';

function normalizeLookupToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function composeLookupKey(name: string, variant: string): string {
  const nk = normalizeLookupToken(name);
  const vk = normalizeLookupToken(variant);
  return vk ? `${nk}::${vk}` : nk;
}

/**
 * Unambiguous name / name::variant keys → product id. Keys that matched more than one
 * product id are listed in `ambiguousKeys` only (not in `map`).
 */
export type ProductLookupIndex = {
  map: Map<string, string>;
  ambiguousKeys: Set<string>;
};

/**
 * Build lookup index: `name` or `name::variant` (lowercase keys). Duplicate names (or
 * duplicate composite keys) across different product ids are marked ambiguous so imports
 * fail the row instead of picking an arbitrary product.
 */
export function buildProductLookupMap(
  products: Pick<Product, 'id' | 'name' | 'variant'>[],
): ProductLookupIndex {
  const keyToIds = new Map<string, Set<string>>();

  const addKey = (key: string, id: string) => {
    let set = keyToIds.get(key);
    if (!set) {
      set = new Set();
      keyToIds.set(key, set);
    }
    set.add(id);
  };

  for (const p of products) {
    const nameKey = normalizeLookupToken(p.name);
    addKey(nameKey, p.id);
    const variantKey = normalizeLookupToken(p.variant ?? '');
    if (variantKey) {
      addKey(composeLookupKey(nameKey, variantKey), p.id);
    }
  }

  const map = new Map<string, string>();
  const ambiguousKeys = new Set<string>();
  for (const [key, ids] of keyToIds) {
    if (ids.size === 1) {
      map.set(key, [...ids][0]!);
    } else {
      ambiguousKeys.add(key);
    }
  }

  return { map, ambiguousKeys };
}

export type ProductLookupResolution = {
  productId: string | null;
  /** More than one catalog row shares this lookup key. */
  ambiguous: boolean;
};

/**
 * Resolve `raw` against a pre-built index (trim + lowercase). Empty input → not found, not ambiguous.
 */
export function resolveProductLookup(index: ProductLookupIndex, raw: string): ProductLookupResolution {
  const trimmed = raw.trim();
  const rawParts = trimmed.split('::');
  const k =
    rawParts.length >= 2
      ? composeLookupKey(rawParts[0] ?? '', rawParts.slice(1).join('::'))
      : normalizeLookupToken(trimmed);
  if (!k) {
    return { productId: null, ambiguous: false };
  }
  if (index.ambiguousKeys.has(k)) {
    return { productId: null, ambiguous: true };
  }
  const id = index.map.get(k);
  if (id) {
    return { productId: id, ambiguous: false };
  }
  return { productId: null, ambiguous: false };
}
