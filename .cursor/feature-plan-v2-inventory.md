# Feature Implementation Plan — Manual Inventory (`prd.v2.4.3` + clarified UX)

**Overall Progress:** `100%`

## TLDR

Ship **`inventory_items`**: list + per-row edit, optional **`product_id`** link, optional **`reorder_level`** with **yellow row** when `current_stock <= reorder_level`. **CSV template + bulk upload** (partial success + error CSV) on **Inventory** and **Settings**; support **`product_lookup`** and **`add_to_products`** (CSV header alias `add_to_products` / user-facing “Add to section” `True`) with **stub Product** defaults (`category = 'GENERAL'`, `cost_price` = row unit cost, `mrp` = `cost_price`). **Keep** existing **sales/expense auto stock** on **`public.inventory`**. Add **Inventory** to **nav last** (`lib/nav.ts`). UI matches **Products/Vendors** shell (PageHeader actions `h-11 rounded-xl`, Template, Bulk Upload, Refresh).

## Critical Decisions

- **Decision 1: Two-layer stock** — Movement stays on **`public.inventory`** (`inventory_apply_delta` / existing triggers). **`inventory_items`** is the **UI + CSV + manual** source of truth for display fields (name, unit, cost, reorder). When **`product_id` IS NOT NULL**, **sync quantity** ↔ **`public.inventory`** (app or DB triggers) so automation and manual edits stay aligned; rows **without** `product_id` are manual-only (no sale/expense delta).
- **Decision 2: Stub product** — If **`add_to_products`** is true and no match: **`INSERT products`** with **`name`** from row, **`category = 'GENERAL'`**, **`cost_price` / `mrp`** from **`unit_cost`**, **`variant` null**, **`mrp`/`cost` ≥ 0** as today; user edits category/MRP later in Products.
- **Decision 3: `product_lookup`** — Resolve like Sales bulk (name / variant); on success set **`product_id`** and ensure **`public.inventory`** row exists + aligned qty when linking.
- **Decision 4: Row edit** — **All** fields editable (including clearing/changing **`product_id`** per RLS); validate consistency when linking (e.g. warn if name diverges from product—optional, minimal v1: allow edit).
- **Decision 5: Low-stock UI** — Highlight row when **`reorder_level` IS NOT NULL** and **`current_stock <= reorder_level`** (inclusive at threshold).
- **Decision 6: Nav** — Label **Inventory**, **last** in **`MAIN_NAV_ITEMS`**; mirror **`Sidebar.tsx`** if kept in sync.

## Tasks

- [x] 🟩 **Step 1: Database — `inventory_items` + sync**
  - [x] 🟩 Forward migration: `public.inventory_items` (`id`, `business_id`, `name`, `unit`, `current_stock` numeric ≥ 0, `unit_cost` numeric ≥ 0, `reorder_level` nullable numeric, `product_id` nullable FK → `products`, `created_at` / `updated_at`, tenant RLS policies).
  - [x] 🟩 Sync mechanism when **`product_id` present**: after manual/API updates to **`inventory_items.current_stock`**, upsert/update **`public.inventory`** for same `business_id` + `product_id`; after **`inventory`** changes from triggers, update matching **`inventory_items.current_stock`** (implement as small **trigger(s)** or **RPC** pair—minimal, documented in migration comments).
  - [x] 🟩 Unique guard: at most one **`inventory_items`** row per **`(business_id, product_id)`** when `product_id` is not null (partial unique index or constraint).
  - [x] 🟩 Update **`supabase/schema.sql`** greenfield block for `inventory_items` + sync notes.

- [x] 🟩 **Step 2: Types + queries**
  - [x] 🟩 `lib/types/inventoryItem.ts` (or equivalent) matching table.
  - [x] 🟩 `lib/queries/inventoryItems.ts`: list by business, CRUD helpers; deprecate or narrow **`fetchInventoryOverview`** usage—**Inventory page** reads **`inventory_items`** (optionally still show value = `current_stock * unit_cost` in UI).

- [x] 🟩 **Step 3: Product resolution + stub (shared helpers)**
  - [x] 🟩 Reuse / extract **`product_lookup`** resolution (map from active `products` by name/variant, same as Sales import).
  - [x] 🟩 Helper **`ensureStubProduct`** when **`add_to_products`** true: insert Product with defaults above; link **`product_id`** on item.

- [x] 🟩 **Step 4: Inventory UI (`app/inventory/page.tsx`)**
  - [x] 🟩 **PageHeader**: Template, Bulk Upload, Refresh — **`h-11 gap-2 rounded-xl`** like Products/Vendors.
  - [x] 🟩 Table: columns aligned with PRD + linked product indicator; **row bg warning tint** when low-stock rule fires.
  - [x] 🟩 **Dialog (or sheet) per-row edit**: all fields + product picker / clear link; on save call update + sync path.
  - [x] 🟩 **Add row**: new item flow; if user picks/creates product attachment, optional **“Add to Products”** confirm when SKU unknown (mirror CSV semantics).
  - [x] 🟩 Loading / empty / error + Sonner toasts; no `alert()`.

- [x] 🟩 **Step 5: CSV template + import**
  - [x] 🟩 Headers (minimal): e.g. `name`, `unit`, `current_stock`, `unit_cost`, `reorder_level`, `product_lookup`, `add_to_products` (boolean `true`/`false`).
  - [x] 🟩 Parse with **`lib/importCsv.ts`**; row-by-row insert/update + issues CSV; toast summary.
  - [x] 🟩 Rules: if **`product_lookup`** resolves → set **`product_id`**, align **`inventory`**; if **`add_to_products`** true → stub product then link; conflicts (both lookup fail and no flag) → issue row.

- [x] 🟩 **Step 6: Settings hub**
  - [x] 🟩 Same template download + file upload block for Inventory as other modules (`app/settings/page.tsx`).

- [x] 🟩 **Step 7: Navigation**
  - [x] 🟩 **`lib/nav.ts`**: append **Inventory** (icon e.g. **Warehouse**) **last**.
  - [x] 🟩 **`components/layout/Sidebar.tsx`**: same item/order if still maintained.

- [x] 🟩 **Step 8: Docs + verification**
  - [x] 🟩 **`CHANGELOG.md`** Unreleased bullets.
  - [x] 🟩 **`docs/knowledgebase.md`** short note: `inventory_items` vs `inventory` sync, CSV flags.
  - [x] 🟩 **`npm run build`**; smoke: link product → sale reduces stock and row updates; expense with `product_id` increases; CSV partial success.

## Out of scope (explicit)

- Dashboard v2 date filters (`prd.v2.4.4`).
- Removing or rewriting **`save_sale`** / expense stock logic beyond **sync bridge** above.
- Mobile accordion sales table (`prd.v2.mobile-polish`).

## Execution order

1. Step 1 → 2 → 3  
2. Step 4 + 5 (can parallelize import after types)  
3. Step 6–8  
