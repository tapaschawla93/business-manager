# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR

Ship dashboard KPIs (date-ranged **net cash / net online / cash in hand**, **inventory value from `inventory_items`**) via an in-place **`get_dashboard_kpis(p_from, p_to)`** RPC; add **`expenses.update_inventory`** and UI toggles; sidebar **business name**; inventory **zero-stock** filter; date range via **react-day-picker** + **date-fns** (Sheet on mobile, Dialog on desktop). **No v2 RPC.**

## Critical Decisions

- **RPC:** `CREATE OR REPLACE get_dashboard_kpis(p_from, p_to)`; drop `cash_collected` / `online_collected`; add `net_cash`, `net_online`, `cash_in_hand_total`.
- **Inventory value:** `SUM(inventory_items.current_stock * inventory_items.unit_cost)` — not `products.cost_price`.
- **Cash math (range):** `net_cash = cash_sales − cash_expenses`, `net_online = online_sales − online_expenses`, `cash_in_hand_total = net_cash + net_online`.
- **Date UI:** `react-day-picker` + `date-fns`; shared inner picker; Sheet (`<md`) vs Dialog (`md+`).
- **`update_inventory`:** `boolean not null default true`; new migration only; **`expenses_sync_inventory`** stays **after insert or update** (soft-delete = `UPDATE deleted_at`); gate deltas with `coalesce(update_inventory, true)` on OLD and NEW.

## Tasks:

- [x] 🟩 **Step 1: DB migration — `expenses.update_inventory`**
  - [x] 🟩 New migration + `supabase/schema.sql` sync
  - [x] 🟩 Replace `expenses_sync_inventory` to respect flag

- [x] 🟩 **Step 2: Dashboard RPC — `get_dashboard_kpis`**
  - [x] 🟩 New migration: `inventory_items` value, expense splits, net fields; grants
  - [x] 🟩 `supabase/schema.sql` sync

- [x] 🟩 **Step 3: Client types + parser**
  - [x] 🟩 `lib/queries/dashboard.ts`
  - [x] 🟩 `lib/types/expense.ts`

- [x] 🟩 **Step 4: Dashboard UI — KPIs then date picker**
  - [x] 🟩 `app/page.tsx` — KPI order, cash card, profit color; `PaymentCollectionsCard` removed from `/`
  - [x] 🟩 `react-day-picker`, `date-fns`
  - [x] 🟩 `DashboardDateRangePicker` + `DashboardDateRangeControl`

- [x] 🟩 **Step 5: Sidebar business name**
  - [x] 🟩 `AppShell` — `profiles` embed `businesses(name)`

- [x] 🟩 **Step 6: Inventory zero-stock toggle**
  - [x] 🟩 `app/inventory/page.tsx` + `InventoryMobileList` styling

- [x] 🟩 **Step 7: Expense form — Add to inventory**
  - [x] 🟩 `ExpenseForm.tsx` — product link + `update_inventory`

- [x] 🟩 **Step 8: Verify + changelog**
  - [x] 🟩 `npx tsc --noEmit`, `CHANGELOG.md` `[Unreleased]`

---

## Reference — files touched

| Area | Files |
|------|--------|
| Step 1 | `supabase/migrations/20260331130000_expenses_update_inventory_flag.sql`, `supabase/schema.sql` |
| Step 2 | `supabase/migrations/20260331140000_dashboard_kpis_net_cash_inventory_items.sql`, `supabase/schema.sql` |
| Step 3 | `lib/queries/dashboard.ts`, `lib/types/expense.ts` |
| Step 4 | `package.json`, `app/page.tsx`, `components/dashboard/KPICard.tsx`, `DashboardDateRangeControl.tsx`, `DashboardDateRangePicker.tsx` |
| Step 5 | `components/layout/AppShell.tsx` |
| Step 6 | `app/inventory/page.tsx`, `app/inventory/components/InventoryMobileList.tsx` |
| Step 7 | `app/expenses/components/ExpenseForm.tsx` |

### Step 1 — exact migration SQL

See `supabase/migrations/20260331130000_expenses_update_inventory_flag.sql`.

### Step 2 — RPC `RETURNS TABLE`

See `supabase/migrations/20260331140000_dashboard_kpis_net_cash_inventory_items.sql`.
