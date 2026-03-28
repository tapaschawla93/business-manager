# Feature Implementation Plan — Dashboard v2 + loading / skeleton hardening

**Overall Progress:** `90%`

## TLDR

Ship a **date-scoped home dashboard** (default **YTD**): KPIs, **sales by category**, **top by revenue and by volume**, and **cash vs online collections** with clear semantics (no misleading `cash_in_hand`). Harden **auth and data loading** so the UI does not sit on a **silent gray skeleton** forever: **timeouts**, **visible phase copy**, **Strict Mode–safe session bootstrap** on shell routes, and **logout** that reliably reaches **`/login`**. Remaining work is **operational**: ensure the **SQL migration is applied** on the linked Supabase project and **smoke-test** locally; if the skeleton persists, capture **network / console** evidence.

## Critical Decisions

- **Decision 1: Date range** — Full **from–to** in UI; **default = YTD** (calendar year start through today, aligned with `sales.date`).
- **Decision 2: Sales by category** — Via line items → **`products.category`**; **exclude** soft-deleted products.
- **Decision 3: Top by volume** — **`sum(sale_items.quantity)`** in range; same tenant / soft-delete rules as other dashboard RPCs.
- **Decision 4: Cash vs online** — From **`sales.payment_mode`**; **`net_position`** semantics in **`gross_profit`**; removed misleading **`cash_in_hand`**.
- **Decision 5: Stuck loading** — **`withTimeout`** on **`getUser`** and dashboard **`Promise.all(RPCs)`** (~25s) with actionable messages; dashboard skeleton shows **session vs data** phase text.
- **Decision 6: Strict Mode** — **`useBusinessSession`** uses a **generation ref** so an older async run cannot skip **`setStatus`** and leave **`loading`** forever.
- **Decision 7: Logout** — After **`signOut`**, **`window.location.assign('/login')`** so navigation works even if the client router is wedged.

## Tasks

- [x] 🟩 **Step 1: Database — `get_dashboard_kpis`**
  - [x] 🟩 **`p_from` / `p_to`**; filter on **`sales.date`** (and expenses where applicable).
  - [x] 🟩 **Cash-collected** vs **online-collected**; **`gross_profit`** for net-style read; drop misleading **`cash_in_hand`**.
  - [x] 🟩 Migration **`20260330140000_dashboard_v2_date_range.sql`** + **`supabase/schema.sql`**; **`SECURITY DEFINER`** + grants on **`(date, date)`** signatures.

- [x] 🟩 **Step 2: Database — `get_top_products` + category**
  - [x] 🟩 **`p_from` / `p_to`**; scoped revenue/margin.
  - [x] 🟩 **`top_by_volume`** in JSON payload.
  - [x] 🟩 **`sales_by_category`**; non-deleted products only.

- [x] 🟩 **Step 3: App — `lib/queries/dashboard.ts`**
  - [x] 🟩 Pass date args; **`defaultDashboardYtdRange()`** on home load.
  - [x] 🟩 Parse **`top_by_volume`**, **`sales_by_category`**.

- [x] 🟩 **Step 4: UI — home dashboard**
  - [x] 🟩 From–to, **Apply** + **Reset to YTD**.
  - [x] 🟩 **`PaymentCollectionsCard`**, **`SalesByCategoryTable`**, **`TopProductsTable`** (volume).

- [x] 🟩 **Step 5: Skeleton / auth / shell**
  - [x] 🟩 Home: **`DashboardSkeleton`** with **`phase: 'session' | 'data'`**; RPC load wrapped in **`withTimeout`**.
  - [x] 🟩 **`useBusinessSession`**: **`runBootstrap` discriminant** + **gen ref** + timeout (non-home routes).
  - [x] 🟩 **`AppChrome`** / missing env handling; **`PageLoadingSkeleton`** “stuck” path to **`/login`** where used.
  - [x] 🟩 **Logout**: hard navigate to **`/login`** after sign-out.

- [x] 🟩 **Step 6: Typecheck**
  - [x] 🟩 **`npx tsc --noEmit`** passes on current tree (re-run after any local edits).

- [ ] 🟥 **Step 7: Apply migration + smoke test**
  - [ ] 🟥 Apply **`20260330140000_dashboard_v2_date_range.sql`** on the **same** Supabase project as **`.env.local`** (RPC signature mismatch or missing functions → errors or very long waits).
  - [ ] 🟥 **`npm run dev`**, hard refresh **`/`** and one **AppShell** route (e.g. **`/expenses`**): confirm content or **clear error** after timeout, not an endless gray block with no message.
  - [ ] 🟥 Confirm **Logout** lands on **`/login`**.

- [ ] 🟥 **Step 8: If still skeleton (diagnostics only)**
  - [ ] 🟥 Browser **Network**: pending or failed **`*.supabase.co`** (paused project, wrong URL/key, ad blocker).
  - [ ] 🟥 **Console** errors; confirm **`.env.local`** keys match the project where the migration ran.
