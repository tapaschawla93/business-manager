# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **UI Overhaul (V1):** shadcn-style components under `components/ui/` (Button, Card, Input, Table, Dialog, Sheet, Popover, Command, AlertDialog, Sonner, etc.), **`#16a34a`** primary tokens in `globals.css`, **`AppChrome` / `AppShell`** with **240px sidebar** (desktop) and **64px bottom nav** (mobile), **`Fab`** on Products + Expenses. **BizManager** branding in sidebar. **Sonner** toasts; archive confirmations via **AlertDialog** (replaces `window.confirm`). Login remains **minimal centered card** (no shell). Sales **product search** uses **Popover + cmdk** (same client product list as before).

- Multi-tenant shell: `businesses` + `profiles`, `create_business_for_user` onboarding RPC, `current_business_id()` for RLS.
- **Products** (`/products`): CRUD, optional `variant`, ₹ display via `formatInrDisplay`, soft archive (`deleted_at`); archive via **`archive_product` RPC** (client calls RPC, not raw update).
- **Sales** (`/sales`): mobile-first form, `save_sale` RPC (server reads MRP/cost from DB; client sends `product_id` + `qty` + `sale_price` only). `sale_items` written only inside RPC.
- **Expenses** (`/expenses`): table + RLS; list/form; archive via **`archive_expense` RPC**.
- **Settings** (`/settings`): CSV export for active rows — products, sales, sale_items, expenses (`deleted_at IS NULL` where applicable).
- **Nav**: `AppNav` with session + sign-out; internal routes use **`next/link`** (client-side navigation); **Dashboard** first → `/`, **lucide-react** icons (nav + KPI cards).
- **Shared**: `PaymentToggle` in `components/` for sales + expenses.
- **Dashboard** (`/` when logged in): read-only KPIs + top 5 by revenue / avg margin %; loads **`get_dashboard_kpis`** + **`get_top_products`** (`lib/queries/dashboard.ts`, `components/dashboard/KPICard`, `TopProductsTable`). All-time scope; `deleted_at IS NULL` on sales/expenses in RPCs.
- Migrations under `supabase/migrations/` (products, foundation soft-delete + sales, JSON loop fix for `save_sale`, sprint2 `save_sale` WHERE + triggers, expenses, RLS soft-delete policies, archive RPCs, **dashboard V1 RPCs**). `supabase/schema.sql` kept in sync for greenfield.

### Changed

- **Home** (`app/page.tsx`): business dashboard after auth (KPI cards, secondary metrics, top-product tables + loading/error states), not a minimal placeholder.
- Login: sign-in / sign-up aligned with onboarding RPC; email-confirmation path documented in UI.
- `save_sale` final `UPDATE sales` includes `business_id` guard (migration + schema).

### Fixed

- **`save_sale`**: `jsonb_array_elements` loop uses explicit `elem` column (avoids `record has no field` runtime error).
- **Soft-delete UX**: archive no longer chains `.select()` after update (RETURNING vs SELECT RLS on archived rows); products/expenses archive use definer RPCs for reliable `deleted_at`.
- **Sales form**: removing the only line resets to a fresh empty line; **`save_sale`** JSON response validated before showing ₹ totals (amber fallback if payload incomplete).
- **Dashboard**: bad or unparseable **`get_top_products`** JSONB → returned **error** (surface in UI), not silent empty top-product tables; string JSONB coerced via `JSON.parse` when needed.

### Security

- RLS on tenant tables; no client INSERT on `sale_items`; `save_sale` / `archive_*` / **`get_dashboard_kpis`** / **`get_top_products`** RPCs are `SECURITY DEFINER` with `auth.uid()` + `current_business_id()` / `business_id` scoping inside the function.
