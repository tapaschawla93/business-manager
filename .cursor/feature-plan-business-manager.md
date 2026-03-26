# Feature Implementation Plan

**Overall Progress:** `98%`

## TLDR

Business Manager is a multi-tenant Next.js + Supabase app: auth, soft-delete RLS, products, atomic **sales** via `save_sale`, settings CSV export (products / sales / sale_items). **Sprint 2** fixes two review warnings (`save_sale` final `UPDATE` + migration/trigger parity for **businesses / profiles / products**), then adds **Expenses V1** (table, RLS, `/expenses` UI, query helpers for a future dashboard, expenses CSV).

## Critical Decisions

- **Tenancy**: `business_id` + `current_business_id()`; RLS reads use `deleted_at IS NULL` where soft delete applies; no client **DELETE** on domain tables (archive via `UPDATE`).
- **Sales**: `save_sale` is `SECURITY DEFINER`; snapshots from `products` only; `sale_items` have no `deleted_at`; JSON array loop uses explicit `jsonb_array_elements` alias (see knowledgebase).
- **Expenses V1**: Direct client **INSERT**/`UPDATE`/`SELECT` only (no RPC); `total_amount = quantity × unit_cost` from UI only; `vendor_name` + `item_description` **NOT NULL**; `payment_mode` `'cash' | 'online'`; no inventory link.
- **Export**: One CSV per module; active rows only (`deleted_at IS NULL`); expenses added in Sprint 2.
- **Shared UI**: Move `PaymentToggle` to `components/` for sales + expenses; ₹ display matches products (`formatInrDisplay`).

## Tasks

### Shipped (reference)

- [x] 🟩 **Supabase core & auth**
  - [x] 🟩 `businesses`, `profiles`, onboarding RPC, session/nav
- [x] 🟩 **Foundation + products**
  - [x] 🟩 Soft delete, `updated_at` triggers (partial migration gap — fixed in Sprint 2 Part 1), product UI, archive
- [x] 🟩 **Sales**
  - [x] 🟩 `sales` / `sale_items`, `save_sale`, sales UI, export slice
- [x] 🟩 **Settings export (partial)**
  - [x] 🟩 products, sales, sale_items CSV — **expenses** in Sprint 2

### Sprint 2 — Part 1: Warning fixes

- [x] 🟩 **Step 1: Migration `20250327120000_fix_warnings_sprint2.sql`**
  - [x] 🟩 `CREATE OR REPLACE save_sale`: final `UPDATE public.sales` add `AND business_id = v_bid` (tight tenant guard)
  - [x] 🟩 Idempotent `set_*_updated_at` on **businesses**, **profiles**, **products** (`execute function public.set_current_timestamp_updated_at()`)
  - [x] 🟩 Do **not** edit older migrations
- [x] 🟩 **Step 2: Align `supabase/schema.sql`**
  - [x] 🟩 Same `save_sale` + same three triggers on greenfield schema

### Sprint 2 — Part 2: Expenses V1

- [x] 🟩 **Step 3: Migration `20250327130000_expenses_v1.sql` + schema**
  - [x] 🟩 `expenses` table (columns per PRD), `CHECK (quantity > 0)`, `unit_cost >= 0`, payment check, `expenses_business_id_idx`, `set_expenses_updated_at`, RLS: **select / insert / update** only (no delete policy)
  - [x] 🟩 Append matching block to `supabase/schema.sql`
- [x] 🟩 **Step 4: Types & query layer**
  - [x] 🟩 `lib/types/expense.ts`
  - [x] 🟩 `lib/queries/expenses.ts`: `fetchActiveExpenses(supabase, options?)`, `getExpenseSummary(supabase, businessId, range?)` → `total_expenses`, `cash_expenses`, `online_expenses`
- [x] 🟩 **Step 5: UI**
  - [x] 🟩 Move `PaymentToggle` → `components/PaymentToggle.tsx`; fix `SalesForm` import
  - [x] 🟩 `app/expenses/page.tsx`: auth gate, list + form
  - [x] 🟩 `app/expenses/components/ExpenseList.tsx`: active only, sort `date desc`, `created_at desc`, ₹ amounts, edit / archive
  - [x] 🟩 `app/expenses/components/ExpenseForm.tsx`: required fields, live total, `datetime-local` → ISO, insert + update
  - [x] 🟩 `components/AppNav.tsx`: link `/expenses`
- [x] 🟩 **Step 6: Settings export**
  - [x] 🟩 `app/settings/page.tsx`: export `expenses.csv`, active only, headers match columns

### QA

- [ ] 🟥 **Step 7: Regression**
  - [ ] 🟥 Apply migrations; save sale; archive product + expense; exports include expenses; sales still works after `PaymentToggle` move

---

### Sprint 2 — Part 3: Dashboard V1 (read-only home on `/`)

- [x] 🟩 **Step 8: Dashboard RPC migration**
  - [x] 🟩 Add `supabase/migrations/20250330150000_dashboard_v1_rpcs.sql`
  - [x] 🟩 Implement `public.get_dashboard_kpis()` (KPI table return type)
  - [x] 🟩 Implement `public.get_top_products()` (jsonb payload, margin excludes `cost_price_snapshot <= 0`)
  - [x] 🟩 `GRANT EXECUTE` both RPCs to `authenticated`

- [x] 🟩 **Step 9: Dashboard query helpers**
  - [x] 🟩 Create `lib/queries/dashboard.ts`
  - [x] 🟩 `getDashboardKPIs(supabase)` → calls `get_dashboard_kpis()`
  - [x] 🟩 `getTopProducts(supabase)` → calls `get_top_products()`
  - [x] 🟩 Runtime-safe numeric conversion for RPC-returned money fields

- [x] 🟩 **Step 10: Dashboard UI components**
  - [x] 🟩 Create `components/dashboard/KPICard.tsx`
  - [x] 🟩 Create `components/dashboard/TopProductsTable.tsx`
    - [x] 🟩 Render Top 5 by Revenue and Top 5 by Avg Margin %
    - [x] 🟩 Format money via `formatInrDisplay`; show margin as `${avg_margin_pct}%` or `—`
    - [x] 🟩 Label format uses `"Product Name — Variant"` when variant present (from RPC)

- [x] 🟩 **Step 11: Dashboard home page**
  - [x] 🟩 Update `app/page.tsx` to dashboard (read-only)
  - [x] 🟩 Fetch RPCs on load (use `Promise.all`)
  - [x] 🟩 Show loading state until RPC results resolve
  - [x] 🟩 Layout: top KPIs first (mobile stacked), then secondary KPIs, then `TopProductsTable`

- [x] 🟩 **Step 12: Nav update + icons**
  - [x] 🟩 Add `lucide-react` dependency to `package.json`
  - [x] 🟩 Update `components/AppNav.tsx`
    - [x] 🟩 Remove “Home” entirely
    - [x] 🟩 Add “Dashboard” as first nav item linking to `/` (no duplicates)
    - [x] 🟩 Nav items order: Dashboard, Products, Sales, Expenses, Settings
    - [x] 🟩 Use lucide icons for nav + KPI card icons

- [ ] 🟥 **Step 13: Dashboard QA**
  - [ ] 🟥 KPI correctness: all-time totals exclude `deleted_at`, `Gross Profit = Revenue − Expenses`, cash/online splits correct
  - [x] 🟩 Top products payload parsing: invalid `get_top_products` JSONB now fails loudly (no silent empty state)
  - [ ] 🟥 Top products correctness: join sale_items→sales→products; margin excludes `cost_price_snapshot <= 0`
  - [ ] 🟥 UX: loading state; mobile-first layout; no writes on dashboard

## Implementation reference (no duplicate SQL here)

- **Part 1 SQL**: `supabase/migrations/20250327120000_fix_warnings_sprint2.sql`
- **Part 2 SQL**: `supabase/migrations/20250327130000_expenses_v1.sql`
- **Query signatures**: see Sprint 2 exploration — `ExpenseSummaryRange`, `fetchActiveExpenses`, `getExpenseSummary`

**Target progress after Sprint 2 complete:** `98%`
