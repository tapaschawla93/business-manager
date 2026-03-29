# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Mobile row actions:** **Products**, **Inventory**, **Sales** — kebab with **Edit** + **Archive** / **Delete line**. **Vendors** / **Expenses** mobile kebab — **Archive** only (tap vendor name for detail; **Expenses** desktop table still has **Edit**). **`components/ui/dropdown-menu.tsx`** (Radix **DropdownMenu**).
- **Inventory mobile delete:** **`inventory_apply_delta_for_tenant`** (−`current_stock` when linked) then **`inventory_items` delete** (works without **`delete_inventory_item`** RPC).
- **Expenses ↔ ledger:** **`expenses_sync_inventory`** does nothing on **UPDATE** — archiving or editing an expense does not change stock; new stock purchases still apply **`inventory_apply_delta_for_tenant`** after **INSERT**. Migration **`20260401170000_expenses_sync_inventory_update_noop.sql`**.
- **Sales RPC hint:** **`saleRpcUserHint`** + **`isPostgrestMissingRpcError`** (`lib/saleRpcUserHint.ts`) when **`archive_sale`** / **`update_sale`** are missing — points at **`20260401160000_sale_archive_update_inventory_delete_rpc.sql`**.
- **RPCs:** **`archive_sale`** (soft-delete sale + restore stock per line), **`update_sale`** (replace header + lines with correct inventory deltas), **`delete_inventory_item`** (remove `inventory_items` row + ledger adjustment when linked). Migration **`20260401160000_sale_archive_update_inventory_delete_rpc.sql`**; optional **`20260401180000_postgrest_reload_schema.sql`** (`pg_notify` PostgREST schema reload); **`supabase/schema.sql`** updated.
- **`lib/archiveSale.ts`:** **`archiveSaleWithClientFallback`** — **`archive_sale`** first; on missing-RPC-style errors, per-line **`inventory_apply_delta_for_tenant`** + **`sales.deleted_at`** update **without** PATCH **`.select()`** (not one DB transaction).
- **Sales:** mobile **Edit** opens **`SalesForm`** prefilled; **Archive** confirms via **`archiveSaleWithClientFallback`**. **`SalesForm`** supports **`editSale`** + **`update_sale`**; **`fetchSalesList`** includes **`notes`** for the editor.
- **Dashboard v2.1:** **`get_dashboard_kpis`** return shape — **`net_cash`**, **`net_online`**, **`cash_in_hand_total`** (period sales minus expenses by payment mode); **`inventory_value`** from **`inventory_items`** (current_stock × unit_cost). Migrations **`20260331130000_expenses_update_inventory_flag.sql`** (`expenses.update_inventory` + guarded **`expenses_sync_inventory`**) and **`20260331140000_dashboard_kpis_net_cash_inventory_items.sql`**; **`supabase/schema.sql`** aligned.
- **Dependencies:** **`react-day-picker`**, **`date-fns`**, **`@radix-ui/react-switch`**.
- **UI:** **`DashboardDateRangeControl`** + **`DashboardDateRangePicker`** (range calendar; **Sheet** on small screens, **Dialog** on **`md+`**); **`components/ui/switch.tsx`**. Home dashboard KPI order + **Cash in Hand** card (sub-lines for net cash / net online); **`PaymentCollectionsCard`** removed from **`/`**. Sidebar shows **business name** under BizManager (**`AppShell`**, `profiles` → **`businesses(name)`** embed).
- **Inventory:** **Show zero stock** toggle; muted styling for zero on-hand rows when the toggle is on (`InventoryMobileList` **`dimZeroStock`**).
- **Expenses:** optional **catalog product** link + **Add to inventory** switch (**`ExpenseForm`**); persists **`product_id`** and **`update_inventory`** (bulk CSV unchanged — DB default **`true`**).
- **`lib/products/productMargin.ts`:** shared catalog **margin %** (MRP vs cost + tone classes) for **Products** table + **`ProductsMobileList`**.
- **`components/mobile/MobileAccordion.tsx`:** `MobileAccordionChevron`, `MobileAccordionBody` (`contentId` → `id` + `role="region"`, `aria-controls` on row toggles).
- **`SaleListLineDetail.id`:** `fetchSalesList` selects **`sale_items.id`**; mobile line blocks use stable React keys.
- **Docs:** `docs/knowledgebase.md` — **Sales RPCs** (PostgREST schema cache, **`archive_sale`** / **`update_sale`**, client fallback, RLS + PATCH RETURNING); **Mobile polish** (accordion/`md` split, keys, `productById` map, margin helper, a11y); **client loader error UX** (toast + `cancelled` + `devError` for Supabase reference fetches).
- **Manual inventory (`inventory_items`):** `/inventory` page (list, edit dialog, product link, low-stock row tint, CSV template + bulk import, unlinked-save **AlertDialog**). Ledger **`public.inventory`** (`quantity_on_hand`); linked lines sync via DB triggers. Settings: inventory CSV template + upload. Nav **Inventory** last (`lib/nav.ts`, `Sidebar.tsx`). Migrations `20260328120000_inventory_items.sql`, `20260329103000_save_sale_restore_inventory_delta.sql`, `20260329120000_inventory_sync_triggers_security_definer.sql`; greenfield **`supabase/schema.sql`** §4c + **`inventory_apply_delta`** + **`save_sale`** stock step.
- **`npm run dev:clean`:** `rm -rf .next && next dev` (fixes corrupt dev cache / missing chunk / “unstyled” UI when CSS 500s).
- **`lib/productLookupMap.ts`:** name / `name::variant` index; **ambiguous** duplicate catalog keys → failed CSV row (inventory + sales Settings bulk + sales page import).
- **`lib/inventory/importInventoryCsv.ts`**, **`stubProduct.ts`**, **`lib/types/inventoryItem.ts`**; **`importCsv`:** `getAddToProductsFlag` (accepts `add_to_section` header alias).
- **`lib/devLog.ts`:** `devError` — logs import failures in **development** only (alongside toasts).
- **`lib/queries/inventoryItems.ts`:** explicit `inventory_items` column list + row mapper (not `select('*')`).
- **UI Overhaul (V1):** shadcn-style components under `components/ui/` (Button, Card, Input, Table, Dialog, Sheet, Popover, Command, AlertDialog, Sonner, etc.), **`#16a34a`** primary tokens in `globals.css`, **`AppChrome` / `AppShell`** with **240px sidebar** (desktop) and **mobile menu FAB + slide-over nav** (post–bottom-bar era). **BizManager** branding in sidebar. **Sonner** toasts; archive confirmations via **Dialog/AlertDialog** (replaces `window.confirm`). Login remains **minimal centered card** (no shell). Sales **product search** uses **Popover + cmdk** (same client product list as before).
- Added `components/layout/Sidebar.tsx` (standalone desktop sidebar component): fixed 240px rail, nav icons, active-state styling, user badge, and logout action. Not wired by default.
- **Bulk upload hub (Settings):** Added CSV template download + CSV upload for **Products**, **Expenses**, and **Sales** (`sale_ref` grouped line-item format). Imports support partial success and downloadable error CSV reports.
- Added shared CSV import helpers in `lib/importCsv.ts` (parse, typed getters, error report CSV builder).
- Added module-level bulk controls on **Products**, **Sales**, and **Expenses** screens (Template + Bulk Upload) in addition to Settings.
- **Docs:** `docs/PRD.md` — `prd.v2.4.3` manual inventory delivery notes; `prd.v2.mobile-polish` (**mobile shell** + **Sales accordion** on small screens).
- **Docs:** `docs/knowledgebase.md` — manual inventory ledger vs `inventory_items`, RLS vs **`SECURITY DEFINER`** sync triggers, Next “plain HTML” / `.next` / port, React async session effect hygiene, vendors migration baseline, `lib/nav` single source, **Dashboard v2** (date range RPCs, timeouts, Strict Mode bootstrap, stale fetch guard).

- Multi-tenant shell: `businesses` + `profiles`, `create_business_for_user` onboarding RPC, `current_business_id()` for RLS.
- **Products** (`/products`): CRUD, optional `variant`, ₹ display via `formatInrDisplay`, soft archive (`deleted_at`); archive via **`archive_product` RPC** (client calls RPC, not raw update).
- **Sales** (`/sales`): mobile-first form, `save_sale` RPC (server reads MRP/cost from DB; client sends `product_id` + `qty` + `sale_price` only). `sale_items` written only inside RPC.
- **Expenses** (`/expenses`): table + RLS; list/form; archive via **`archive_expense` RPC**.
- **Settings** (`/settings`): CSV export for active rows — products, sales, sale_items, expenses (`deleted_at IS NULL` where applicable).
- **Nav**: Logged-in shell = **`AppShell`** — desktop **sidebar**; mobile **menu FAB** (bottom-right) toggles **left Sheet** with same **`MAIN_NAV_ITEMS`** + logout/user (no bottom tab bar). Internal routes use **`next/link`**. **lucide-react** icons (nav + KPI cards).
- **Shared**: `PaymentToggle` in `components/` for sales + expenses.
- **Dashboard v2** (`/`): **from–to** dates (default **YTD**); RPCs **`get_dashboard_kpis(p_from,p_to)`** + **`get_top_products(p_from,p_to)`** — period revenue/expenses, **gross_profit**, **cash_collected** / **online_collected**, sales count, avg sale; **inventory_value** not range-filtered. JSON: **top_by_revenue**, **top_by_margin**, **top_by_volume**, **sales_by_category** (non-deleted products). **`PaymentCollectionsCard`**, **`SalesByCategoryTable`**, **`TopProductsTable`**. **`lib/queries/dashboard.ts`**, **`defaultDashboardYtdRange()`**. Migration **`20260330140000_dashboard_v2_date_range.sql`** (drops zero-arg RPCs); greenfield **`supabase/schema.sql`** aligned.
- **Session / shell:** **`lib/auth/useBusinessSession.ts`** (`getUser` + **`profiles`**, **`withTimeout`**, Strict Mode **gen ref**). **`PageLoadingSkeleton`**, **`SessionRedirectNotice`**. Shell pages (products, sales, expenses, inventory, vendors, settings, …) use hook + skeleton/redirect pattern. **`isSupabaseConfigured()`**, **`MissingSupabaseConfig`**, **`AppChrome`** gate. **`AppShell`** logout → **`window.location.assign('/login')`**. Shared **`lib/withTimeout.ts`**.
- Migrations under `supabase/migrations/` (products, foundation soft-delete + sales, JSON loop fix for `save_sale`, sprint2 `save_sale` WHERE + triggers, expenses, RLS soft-delete policies, archive RPCs, **dashboard v2 date-range RPCs**, **vendors archive**). `supabase/schema.sql` kept in sync for greenfield.

### Changed

- **Breaking (Supabase + client):** **`get_dashboard_kpis`** no longer returns **`cash_collected`** / **`online_collected`** — apply **`20260331140000_dashboard_kpis_net_cash_inventory_items.sql`** and update **`lib/queries/dashboard.ts`** / home page together.
- **Mobile polish — lists:** below **`md`**, accordion mobile lists for **Expenses** (`ExpenseMobileList` + `ExpenseList` split), **Products** (`ProductsMobileList`), **Inventory** (`InventoryMobileList`, `productById` map, linked vs unlinked summary + **Add to catalog**), **Vendors** (`VendorsMobileList`); **`text-xs`**-aligned row chrome + compact single-line rows (expenses/sales headers). Desktop tables unchanged (`hidden md:block`).
- **Mobile polish — actions:** slightly smaller primary/outline buttons on small screens (**`h-10`**, **`text-sm`**, **`md:h-11`** / **`md:text-base`**) on **Products**, **Sales**, **Expenses**, **Inventory**, **Vendors** pages + **`ExpenseForm`**; **`Button`** **`size="full"`** default height relaxed so pages can override.
- **Dashboard** (`/`): tighter KPI/card/table padding + type below **`md`** (`KPICard`, payment collections, category + top-products tables, date-range bar on `app/page.tsx`).
- **Sales (`/sales`):** below **`md`**, **accordion** list replaces wide table (`SalesMobileList`); **`fetchSalesList`** returns **`lines`** + **`total_profit` / `total_cost`**. Desktop table unchanged (`prd.v2.mobile-polish`).
- **Mobile shell:** **`MobileBottomNav`** removed; **`AppShell`** uses **menu FAB** + **`Sheet`** from left (`prd.v2.mobile-polish`). Per-page **Add** FABs removed from Products/Expenses/Sales (nav menu FAB only); **`globals.css`** keeps **`--page-fab-bottom-mobile`** if a stacked page FAB returns later.
- **Home** (`app/page.tsx`): dashboard v2 UI + **`useBusinessSession`** (same as shell routes); **`withTimeout`** on KPI fetch; **load gen ref** ignores stale RPC after range change; session vs data skeleton copy.
- **Breaking (Supabase):** zero-arg **`get_dashboard_kpis`** / **`get_top_products`** removed — apply **`20260330140000_dashboard_v2_date_range.sql`** before/with this client.
- Login: sign-in / sign-up aligned with onboarding RPC; email-confirmation path documented in UI.
- `save_sale` final `UPDATE sales` includes `business_id` guard (migration + schema).
- **Products** (`app/products/page.tsx`) UI rebuilt to shadcn dashboard layout: new header + CTA, searchable table (Name/Category/MRP/Cost/Margin%/Actions), color-coded margin %, centered empty state, dialog-based add/edit + archive confirmation, and toast-based feedback. Supabase reads/writes/RPC flow unchanged.
- **Sales schema/RPC contract:** `sales.customer_name` is now nullable; optional `customer_phone`, `customer_address`, and `sale_type` (`B2C`/`B2B`/`B2B2C`) added. `save_sale` now accepts optional customer fields and optional sale type.
- **Sales UI:** New Sale form now supports optional customer name/phone/address and optional sale type; Sales list header renamed from **Status** to **Mode of payment**.
- **Sales UI flow:** In New Sale, line entry now starts with product search, followed by qty/price, then add-more; sale/customer/date details remain below line items.
- Removed redundant per-page export CTA/buttons from **Sales** and **Expenses** pages; Settings remains the centralized export surface.
- **Vendors (V2 slice):** `vendors.contact_person` and `vendors.address` (nullable). Vendors page: extended create form, directory table columns, CSV template + bulk upload (partial success + error CSV). Vendor detail shows contact/address. **Expenses:** optional `VendorPicker` sets `vendor_id` + `vendor_name`; editing the name or clearing the picker drops `vendor_id` (free-text does not auto-create a vendor). **`lib/nav.ts`:** `/vendors` on **Dashboard → Products → Sales → Expenses → Vendors** in shell nav (standalone `components/layout/Sidebar.tsx` also lists Vendors if reused).
- **Vendors archive:** `vendors.deleted_at`, RLS hides archived; unique **active** name per tenant (`vendors_business_name_active_uidx`); **`archive_vendor`** RPC; list + detail archive (Dialog). **`lib/queries/vendors`:** `archiveVendor`, active fetches filter `deleted_at`. Migration **`20260331120000_vendors_soft_delete_archive.sql`**.
- **DB migration:** `20260327200000_vendors_contact_address.sql` — baseline `CREATE TABLE IF NOT EXISTS public.vendors` + `ADD COLUMN` for PRD fields + `expenses.vendor_id` / `product_id` + `expenses_validate_refs` when `vendors` or FK columns were missing (safe if `20260326120000_inventory_vendors.sql` never ran).
- **Sales / Settings bulk CSV:** sales import uses `try`/`finally` + shared lookup map (same semantics as inventory CSV).

### Removed

- **Per-page floating add FAB** from **Products**, **Expenses**, **Sales** (header buttons only). **`components/Fab.tsx`** remains, unused.

### Fixed

- **ExpenseForm:** failed **vendors** / **products** Supabase loads show **`toast.error`** (not silent empty pickers).
- **AppShell:** failed **profile → business name** embed shows **`toast.error`**; **`devError`** in development. **`cancelled`** checked before toast (no post-unmount noise).

- **Mobile lists:** **Expense** accordion rows missing React **`key`**; **sale** line items use **`sale_items.id`** keys (not index).
- **Sales → stock:** `save_sale` calls **`inventory_apply_delta`** again (v1 wrap-up had dropped it). Deploy **`20260329103000_save_sale_restore_inventory_delta.sql`** on Supabase.
- **Ledger ↔ lines sync:** **`inventory_pull_to_items`** / **`inventory_items_push_to_ledger`** are **`SECURITY DEFINER`** so RLS does not block sync after `save_sale`. Deploy **`20260329120000_inventory_sync_triggers_security_definer.sql`** after the `save_sale` migration.
- **Inventory page:** tab **visibility** refetch; CSV import **`try`/`catch`/`finally`**; profile bootstrap **`useEffect`** uses **mounted** guard (no post-unmount `setState`).
- **Vercel build (PostCSS)**: Pinned `postcss-load-config` to `^4.0.1` via `package.json` `overrides`. `tailwindcss` 3.4.19 pulled in `postcss-load-config` v6 as a transitive dependency, which is incompatible with Next.js 14.1.0's PostCSS plugin validator. This caused a `Malformed PostCSS Configuration` crash exclusively during `next build` (Vercel production) while `next dev` continued to work locally. The override forces v4 for all consumers and restores build compatibility.

- **`save_sale`**: `jsonb_array_elements` loop uses explicit `elem` column (avoids `record has no field` runtime error).
- **Soft-delete UX**: archive no longer chains `.select()` after update (RETURNING vs SELECT RLS on archived rows); products/expenses archive use definer RPCs for reliable `deleted_at`.
- **Sales archive (client fallback):** `sales` soft-delete via Supabase client omits **`.select()`** on PATCH after **`deleted_at`** — avoids RLS failure on PostgREST **RETURNING** vs **`sales_select_active`** (`lib/archiveSale.ts`).
- **Sales form**: removing the only line resets to a fresh empty line; **`save_sale`** JSON response validated before showing ₹ totals (amber fallback if payload incomplete).
- **Dashboard**: bad or unparseable **`get_top_products`** JSONB → returned **error** (surface in UI), not silent empty top-product tables; string JSONB coerced via `JSON.parse` when needed.
- **Dashboard:** invalid / incomplete **`get_dashboard_kpis`** row → **error** (not “no data” silent path).
- **`withTimeout`:** **`settled`** guard — late resolve after timeout does not double-settle outer Promise.
- **Expense edit runtime errors**: removed writes to `product_id` when column/deploy mismatch caused failures; `vendor_id` is supported again when present in schema.
- **Expense list table semantics**: replaced confusing `Stock` column with `Units` and bound it to entered quantity values.
- **Bulk import reliability**: Products/Expenses imports now insert row-by-row for true partial success; one bad row no longer blocks all valid rows.
- **Bulk import date handling**: accepts historical/present/future dates with flexible input formats; rejects impossible calendar dates via strict normalization.

### Security

- RLS on tenant tables; no client INSERT on `sale_items`; `save_sale` / `archive_product` / `archive_expense` / **`archive_vendor`** / **`get_dashboard_kpis(date,date)`** / **`get_top_products(date,date)`** RPCs are `SECURITY DEFINER` with `auth.uid()` + `current_business_id()` / `business_id` scoping inside the function; execute granted to **`authenticated`** only (not `public`).
- Inventory ledger sync trigger functions **`SECURITY DEFINER`** with **`SET search_path = public`**; updates scoped by **`NEW.business_id`** / **`NEW.product_id`** only.
