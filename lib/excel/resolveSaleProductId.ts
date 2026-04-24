/**
 * Bulk Sales rows can identify a line by `product_id` (UUID) or `product_name`
 * (must match an active product `name` for the tenant, case/space insensitive).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trim, lowercase, collapse internal whitespace — aligns with single active name per business. */
export function normalizeProductNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type ResolveSaleProductResult =
  | { ok: true; productId: string }
  | { ok: false; message: string };

/**
 * Prefer a valid `product_id` UUID when present (backup round-trips).
 * Otherwise resolve `product_name` via map built from DB + products inserted earlier in this upload.
 */
export function resolveSaleProductId(
  row: Record<string, unknown>,
  productIdByNormalizedName: Map<string, string>,
): ResolveSaleProductResult {
  const pidRaw = String(row.product_id ?? '').trim();
  const nameRaw = String(row.product_name ?? '').trim();

  if (pidRaw && !pidRaw.startsWith('<')) {
    if (UUID_RE.test(pidRaw)) {
      return { ok: true, productId: pidRaw };
    }
  }

  if (nameRaw) {
    const k = normalizeProductNameKey(nameRaw);
    const id = productIdByNormalizedName.get(k);
    if (id) return { ok: true, productId: id };
    return {
      ok: false,
      message: `Unknown product_name "${nameRaw}" — add it on the Products sheet (same file, above Sales) or use a valid product_id UUID.`,
    };
  }

  if (pidRaw && !pidRaw.startsWith('<')) {
    return { ok: false, message: 'product_id must be a valid UUID, or set product_name instead.' };
  }

  return {
    ok: false,
    message: 'Set product_name (matching Products.name) or product_id (UUID from backup/DB).',
  };
}
