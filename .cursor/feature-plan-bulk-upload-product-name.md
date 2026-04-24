# Bulk upload — `product_name` on Sales (first-time import)

**Overall progress: 100%** — all planned items implemented.

| Step | Status |
|------|--------|
| `resolveSaleProductId` + `normalizeProductNameKey` | 🟩 |
| `uploadWorkbook`: load `id,name,category` by business; map names; insert `.select('id')`; sales resolution | 🟩 |
| `keySales` gen branch uses `product_name` when `product_id` absent | 🟩 |
| `workbookSchema` Sales column `product_name` + example | 🟩 |
| Template `Import_help` copy | 🟩 |
| Vitest `resolveSaleProductId.test.ts` | 🟩 |
| `CHANGELOG.md` | 🟩 |

## Behaviour

1. **Products** sheet runs first; each successful insert registers **normalized name → `id`** for the same upload pass.
2. **Sales** lines may set **`product_id`** (valid UUID, e.g. from backup) **or** **`product_name`** matching **`Products.name`** (existing DB or just inserted), case/space insensitive.
3. Synthetic dedupe key **`gen:…`** includes **`n:<normalized name>`** when **`product_id`** is empty or a `<…>` placeholder.

## Out of scope (unless requested)

- DB `product_code`, chronological display IDs, **Sale Items** import, multi-line sales per row.
