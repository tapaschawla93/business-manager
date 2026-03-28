# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed

- **Sales → stock:** `save_sale` again decrements `public.inventory` via `inventory_apply_delta` (regression removed in v1 wrap-up migration). Run `supabase/migrations/20260329103000_save_sale_restore_inventory_delta.sql` on Supabase so sales reduce ledger qty and linked **Inventory** lines sync.
- **Inventory sync triggers:** `inventory_pull_to_items` / `inventory_items_push_to_ledger` are `SECURITY DEFINER` so RLS does not block ledger ↔ `inventory_items` updates when `save_sale` runs. Apply `supabase/migrations/20260329120000_inventory_sync_triggers_security_definer.sql` after the `save_sale` fix.
- **Inventory UI:** Refetch lines when the browser tab becomes visible again (e.g. after Sales in another tab).

### Added

- **Manual inventory (`inventory_items`):** `/inventory` page (list, edit dialog, product link, low-stock row tint, CSV template + bulk import, unlinked-save confirm). **`public.inventory`** remains the sale/expense stock ledger; when an item has **`product_id`**, DB triggers sync quantities between **`inventory_items`** and **`inventory`**. Settings hub: **`template_inventory.csv`** + upload. Nav: **Inventory** last (**Warehouse** icon) in **`lib/nav.ts`** and aligned **`Sidebar.tsx`**. Migration `20260328120000_inventory_items.sql`; greenfield **`supabase/schema.sql`** §4c.
- **UI Overhaul (V1):** shadcn-style components under `components/ui/` (Button, Card, Input, Table, Dialog, Sheet, Popover, Command, AlertDialog, Sonner, etc.), **`#16a34a`** primary tokens in `globals.css`, **`AppChrome` / `AppShell`** with **240px sidebar** (desktop) and **64px bottom nav** (mobile), **`Fab`** on Products + Expenses. **BizManager** branding in sidebar. **Sonner** toasts; archive confirmations via **Dialog/AlertDialog** (replaces `window.confirm`). Login remains **minimal centered card** (no shell). Sales **product search** uses **Popover + cmdk** (same client product list as before).
- Added `components/layout/Sidebar.tsx` (standalone desktop sidebar component): fixed 240px rail, nav icons, active-state styling, user badge, and logout action. Not wired by default.
- **Bulk upload hub (Settings):** Added CSV template download + CSV upload for **Products**, **Expenses**, and **Sales** (`sale_ref` grouped line-item format). Imports support partial success and downloadable error CSV reports.
- Added shared CSV import helpers in `lib/importCsv.ts` (parse, typed getters, error report CSV builder).
- Added module-level bulk controls on **Products**, **Sales**, and **Expenses** screens (Template + Bulk Upload) in addition to Settings.
- **Docs:** `docs/PRD.md` — `prd.v2.mobile-polish` (spec: mobile Sales list as accordion rows; **not implemented** — `app/sales/page.tsx` still uses one wide `Table`).
- **Docs:** `docs/knowledgebase.md` — vendors migration baseline (`CREATE IF NOT EXISTS` vs ALTER-only pitfall), shell nav single source (`lib/nav.ts`), local Next dev HTTP 500 / port cleanup.

- Multi-tenant shell: `businesses` + `profiles`, `create_business_for_user` onboarding RPC, `current_business_id()` for RLS.
- **Products** (`/products`): CRUD, optional `variant`, ₹ display via `formatInrDisplay`, soft archive (`deleted_at`); archive via **`archive_product` RPC** (client calls RPC, not raw update).
- **Sales** (`/sales`): mobile-first form, `save_sale` RPC (server reads MRP/cost from DB; client sends `product_id` + `qty` + `sale_price` only). `sale_items` written only inside RPC.
- **Expenses** (`/expenses`): table + RLS; list/form; archive via **`archive_expense` RPC**.
- **Settings** (`/settings`): CSV export for active rows — products, sales, sale_items, expenses (`deleted_at IS NULL` where applicable).
- **Nav**: Logged-in shell = **`AppShell`** + **`MobileBottomNav`**, items from **`lib/nav.ts`** (`MAIN_NAV_ITEMS`); sign-out in sidebar. Internal routes use **`next/link`**. **lucide-react** icons (nav + KPI cards).
- **Shared**: `PaymentToggle` in `components/` for sales + expenses.
- **Dashboard** (`/` when logged in): read-only KPIs + top 5 by revenue / avg margin %; loads **`get_dashboard_kpis`** + **`get_top_products`** (`lib/queries/dashboard.ts`, `components/dashboard/KPICard`, `TopProductsTable`). All-time scope; `deleted_at IS NULL` on sales/expenses in RPCs.
- Migrations under `supabase/migrations/` (products, foundation soft-delete + sales, JSON loop fix for `save_sale`, sprint2 `save_sale` WHERE + triggers, expenses, RLS soft-delete policies, archive RPCs, **dashboard V1 RPCs**). `supabase/schema.sql` kept in sync for greenfield.

### Changed

- **Home** (`app/page.tsx`): business dashboard after auth (KPI cards, secondary metrics, top-product tables + loading/error states), not a minimal placeholder.
- Login: sign-in / sign-up aligned with onboarding RPC; email-confirmation path documented in UI.
- `save_sale` final `UPDATE sales` includes `business_id` guard (migration + schema).
- **Products** (`app/products/page.tsx`) UI rebuilt to shadcn dashboard layout: new header + CTA, searchable table (Name/Category/MRP/Cost/Margin%/Actions), color-coded margin %, centered empty state, dialog-based add/edit + archive confirmation, and toast-based feedback. Supabase reads/writes/RPC flow unchanged.
- **Sales schema/RPC contract:** `sales.customer_name` is now nullable; optional `customer_phone`, `customer_address`, and `sale_type` (`B2C`/`B2B`/`B2B2C`) added. `save_sale` now accepts optional customer fields and optional sale type.
- **Sales UI:** New Sale form now supports optional customer name/phone/address and optional sale type; Sales list header renamed from **Status** to **Mode of payment**.
- **Sales UI flow:** In New Sale, line entry now starts with product search, followed by qty/price, then add-more; sale/customer/date details remain below line items.
- Removed redundant per-page export CTA/buttons from **Sales** and **Expenses** pages; Settings remains the centralized export surface.
- **Vendors (V2 slice):** `vendors.contact_person` and `vendors.address` (nullable). Vendors page: extended create form, directory table columns, CSV template + bulk upload (partial success + error CSV). Vendor detail shows contact/address. **Expenses:** optional `VendorPicker` sets `vendor_id` + `vendor_name`; editing the name or clearing the picker drops `vendor_id` (free-text does not auto-create a vendor). **`lib/nav.ts`:** `/vendors` on **Dashboard → Products → Sales → Expenses → Vendors** for **AppShell** + **MobileBottomNav** (standalone `components/layout/Sidebar.tsx` also lists Vendors if reused).
- **DB migration:** `20260327200000_vendors_contact_address.sql` — baseline `CREATE TABLE IF NOT EXISTS public.vendors` + `ADD COLUMN` for PRD fields + `expenses.vendor_id` / `product_id` + `expenses_validate_refs` when `vendors` or FK columns were missing (safe if `20260326120000_inventory_vendors.sql` never ran).

### Fixed

- **Vercel build (PostCSS)**: Pinned `postcss-load-config` to `^4.0.1` via `package.json` `overrides`. `tailwindcss` 3.4.19 pulled in `postcss-load-config` v6 as a transitive dependency, which is incompatible with Next.js 14.1.0's PostCSS plugin validator. This caused a `Malformed PostCSS Configuration` crash exclusively during `next build` (Vercel production) while `next dev` continued to work locally. The override forces v4 for all consumers and restores build compatibility.

- **`save_sale`**: `jsonb_array_elements` loop uses explicit `elem` column (avoids `record has no field` runtime error).
- **Soft-delete UX**: archive no longer chains `.select()` after update (RETURNING vs SELECT RLS on archived rows); products/expenses archive use definer RPCs for reliable `deleted_at`.
- **Sales form**: removing the only line resets to a fresh empty line; **`save_sale`** JSON response validated before showing ₹ totals (amber fallback if payload incomplete).
- **Dashboard**: bad or unparseable **`get_top_products`** JSONB → returned **error** (surface in UI), not silent empty top-product tables; string JSONB coerced via `JSON.parse` when needed.
- **Expense edit runtime errors**: removed writes to `product_id` when column/deploy mismatch caused failures; `vendor_id` is supported again when present in schema.
- **Expense list table semantics**: replaced confusing `Stock` column with `Units` and bound it to entered quantity values.
- **Bulk import reliability**: Products/Expenses imports now insert row-by-row for true partial success; one bad row no longer blocks all valid rows.
- **Bulk import date handling**: accepts historical/present/future dates with flexible input formats; rejects impossible calendar dates via strict normalization.

### Security

- RLS on tenant tables; no client INSERT on `sale_items`; `save_sale` / `archive_*` / **`get_dashboard_kpis`** / **`get_top_products`** RPCs are `SECURITY DEFINER` with `auth.uid()` + `current_business_id()` / `business_id` scoping inside the function.
