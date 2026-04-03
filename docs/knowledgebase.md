# Module Learnings

## Multi-tenancy, Auth & RLS (Supabase)

### Level 1 — Core idea

- **What**: Tenant data rows carry `business_id`. Postgres **Row Level Security (RLS)** filters every query so users only see rows for *their* business, usually via `current_business_id()` from `profiles` for `auth.uid()`.
- **Why**: Isolation is enforced **in the database**, not only in Next.js—reduces “forgot to filter by tenant” leaks.
- **When**: Multi-tenant SaaS on one shared Postgres (this project: `businesses`, `profiles`, `products`, …).
- **Fit**: Auth JWT → `auth.uid()` → `profiles.business_id` → policies on tables compare `business_id` to that value.

### Level 2 — Mechanics & pitfalls

- **Flow**: Client session (Bearer JWT) → `auth.uid()` in Postgres → RLS `USING` / `WITH CHECK` on each statement.
- **`create_business_for_user` (RPC)**: `SECURITY DEFINER` creates `businesses` + `profiles` in one transaction; avoids permissive client `INSERT` on those tables and keeps onboarding atomic.
- **Tradeoffs**: Strong safety vs. “empty result” debugging when profile or `business_id` on writes is wrong.
- **Edge cases**: No profile → `current_business_id()` null → reads/writes fail or return empty; email confirmation can delay session until `auth.uid()` exists for RPCs.
- **Debug**: Confirm session → row in `profiles` → payload `business_id` matches profile → read Supabase/PostgREST errors on failed mutations.

### Level 3 — Production notes

- **`SECURITY DEFINER`**: Bypasses RLS; audit exposed RPCs, validate inputs, `GRANT EXECUTE` narrowly (`authenticated` only where intended).
- **Performance**: Index `(business_id, …)` on large tables; keep policies simple; avoid heavy per-row work in policies.
- **Alternatives**: App-only filtering (weaker); DB-per-tenant (isolation max, ops cost); service role on **server only** for trusted jobs—never expose in browser.
- **Senior lens**: Hardest part over time is **lifecycle** (signup, invites, admin) without punching holes in RLS.

---

## Auth UI (Next.js client)

- **`AppNav`**: `getSession` on mount + `onAuthStateChange` so the bar updates when auth changes without a full reload.
- **Logged out**: show **Login**; **logged in**: show **email** (truncated UI) + **Sign out** → `supabase.auth.signOut()` then `router.replace('/login')`.
- **Pages like `/products`**: Still redirect if no session; navbar state and route guards complement each other.
- **Internal nav**: Use **`next/link`** for Home/Products/Sales/Expenses/Settings/Login—see **Client navigation (Next.js App Router)** below.

---

## Product Repository (V1)

- **Schema** (`public.products`): `business_id`, `name`, optional `variant`, `category`, `mrp`, `cost_price`, optional `hsn_code` / `tax_pct`, `created_at` / `updated_at`; checks on money and tax band; **unique `(business_id, name)`** (duplicate names only across different businesses).
- **RLS**: Standard pattern `business_id = current_business_id()` for select/insert/update/delete; adding `variant` did not require policy changes.
- **UI**: **₹ display** via `formatInrDisplay` (`en-IN` grouping)—**display only**; DB stores plain numerics. List labels: **Product name**, optional **Variant** line; form field renamed from “Name” to **Product name**.
- **Migrations**: additive column `variant` in `20250325140000_products_variant.sql`; greenfield also reflected in `supabase/schema.sql`.

---

## Sales module + Foundation sprint (V1)

### Decisions made

1. **JSONB iteration in PostgreSQL RPCs**
   - Use `jsonb_array_elements` to turn the array into rows; **do not** pull `SELECT *` into a `RECORD` and then read `r.jsonb_array_elements` — on many Postgres/Supabase builds the column is named **`value`**, which causes **`record has no field …`** at runtime.
   - **Shipped pattern:** `FOR v_elem IN SELECT elem FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(elem, _ord) LOOP` so the element column is explicitly named.
   - Never treat a JSONB value as a row set without `jsonb_array_elements` (or equivalent).

2. **`save_sale` RPC is `SECURITY DEFINER`**
   - It **bypasses RLS** to insert `sales` and `sale_items`. The client has **no `INSERT` policy** on `sale_items` (by design). Writes for lines go only through this RPC.

3. **Snapshots (`cost_price`, `mrp`)**
   - Fetched **inside the RPC** from `public.products` (`business_id = v_bid`, `deleted_at IS NULL`). **Never** accepted from the client — prevents price manipulation.

4. **`sale_items` lifecycle**
   - **No `deleted_at`** on `sale_items`. Soft delete is **only** on the `sales` header. Line visibility is via policies / joins that require **`sales.deleted_at IS NULL`**.

5. **Export / list queries without `.eq('business_id', …)`**
   - Intentional: **RLS** scopes all rows to the current tenant. Do **not** run the same queries with **service role** unless you add explicit `business_id` (or equivalent) filters — service role skips RLS.

### Known issues to fix in a later sprint

- **WARNING:** `save_sale` final `UPDATE public.sales … WHERE id = v_sale_id` should add **`AND business_id = v_bid`** for extra safety.
- **WARNING:** Migration `20250326120000_foundation_soft_delete_sales_rpc.sql` does not recreate **`profiles` / `products` `updated_at` triggers**; `supabase/schema.sql` is complete — align migrations in a follow-up.
- **SUGGESTION:** Type the RPC return shape with the generated **`Database`** types (or a narrow helper) instead of a manual cast in `SalesForm.tsx`.
- **SUGGESTION:** **Orphan `sale_items`** after header soft-delete — document as a future cleanup / V2 story (rows may remain; RLS hides them).

### Pattern to remember

- **Every new table:** `deleted_at`, `created_at`, `updated_at`, index on `business_id` (where the table has it), RLS that includes **`deleted_at IS NULL`** for reads where soft-delete applies.
- **Every new RPC:** justify `SECURITY DEFINER`, **read sensitive fields from the DB** (not the client), and constrain **`business_id` / `current_business_id()`** on all writes and updates.

---

## Client navigation (Next.js App Router)

### Level 1 — Core concept

- **What**: Internal routes should use **`next/link`**’ s `<Link>`, not raw **`<a href="…">`**, for in-app navigation.
- **Why**: `<a>` triggers a **full page load** (new HTML document, JS bundle re-evaluated). `<Link>` performs a **client-side transition**—Next swaps the page shell and fetches only what’s needed.
- **When**: Every same-origin nav in the header, sidebars, cards (e.g. **`AppNav`**: Home, Products, Sales, Expenses, Settings, Login).
- **Fit**: Mobile users feel latency on full reloads; `Link` also enables **prefetch** of routes in production for snappier taps.

### Level 2 — How it works

- **Mechanics**: `Link` wraps the same URLs; styling (`className`) stays the same. External URLs can stay `<a rel="noopener noreferrer">` or use `Link` with absolute `https://`.
- **Tradeoffs**: Middleware and layouts still run; you’re not bypassing auth—you’re avoiding redundant document loads.
- **Edge cases**: Programmatic nav (`router.push`) vs declarative `Link`—both are client-side; use `Link` for discoverable taps.
- **Debug**: With `<a>`, Network tab shows full `document` requests on each nav; with `Link`, you see RSC/fetch payloads instead.

### Level 3 — Deep dive

- **Performance**: Full reload drops React state (unless restored from storage); `Link` keeps client state in memory until unmount.
- **Alternatives**: `router.prefetch` manually; `Link` does sensible prefetch for visible links.
- **Senior lens**: Treat “no full reload on internal nav” as a **product requirement** for dashboard-style apps—especially on slow devices.

---

## Soft delete, RLS `USING` / `WITH CHECK`, and archive RPCs

### Level 1 — Core concept

- **What**: **Archive** = `UPDATE … SET deleted_at = timestamptz` (no client `DELETE`). RLS **`USING`** decides which **existing** rows you may update; **`WITH CHECK`** decides whether the **new row version** is allowed.
- **Why**: If **`WITH CHECK` is omitted** on `UPDATE`, PostgreSQL reuses **`USING` for both**. If `USING` says “only rows where `deleted_at IS NULL`”, the **updated** row would still need `deleted_at IS NULL`—so you can never set `deleted_at`. Explicit **`WITH CHECK`** must allow the archived state (e.g. only verify `business_id`), or you use another mechanism.
- **When**: Any table with soft delete + RLS (this project: **`products`**, **`expenses`**, pattern applies to **`sales`** headers too).
- **Fit**: Aligns with “no hard delete” product rules and CSV export of “active rows only”.

### Level 2 — How it works

- **RETURNING + SELECT RLS**: If the app chains **`.select()`** after **`update({ deleted_at })`**, PostgREST asks Postgres to **return** the updated row. Returned rows must satisfy **SELECT** policies. Policies that require `deleted_at IS NULL` **hide** the archived row—empty body, confusing errors, or “new row violates RLS”-style messages depending on stack. **Fix:** archive via **`update` without `select`**, or use an RPC that doesn’t rely on returning the row to the client.
- **`archive_product` / `archive_expense`**: **`SECURITY DEFINER`** functions read **`profiles.business_id`** for **`auth.uid()`** (active profile only), then **`UPDATE … WHERE id = … AND business_id = v_bid AND deleted_at IS NULL`**. Same **trust model** as **`save_sale`**: tenant boundary enforced inside the function, not by hoping client `UPDATE` survives every RLS edge case.
- **Edge cases**: **`FOUND`** in PL/pgSQL reflects the **last** SQL statement—after `SELECT INTO` then `UPDATE`, test **`NOT FOUND`** only **after** the `UPDATE` if you need row-affected semantics.
- **Debug**: In SQL editor, inspect `pg_policy` for both **`polqual` (USING)** and **`polwithcheck` (WITH CHECK)**; confirm migrations actually applied on the remote DB.

### Level 3 — Deep dive

- **`WITH CHECK` subqueries**: Patterns like `EXISTS (… p.business_id = business_id …)` can **mis-bind** `business_id` to the **inner** table in some queries—**tenant enforcement becomes misleading**. Prefer **unambiguous** column references (per Postgres policy docs) or **definer RPCs** for archive.
- **Performance**: Archive RPCs are O(1) statements per row; no material change at V1 scale.
- **Alternatives**: Triggers that reject `deleted_at` clears; separate **`archive`** table—usually overkill here.
- **Senior lens**: For **soft delete under RLS**, the **durable** pattern is often: **narrow client `UPDATE` policies** *or* **one RPC per destructive-ish action**—fewer footguns than juggling RETURNING + SELECT + CHECK together.

---

## Sales UI — line list & RPC response validation

### Level 1 — Core concept

- **Remove line**: If the user removes the **only** sale line, the list should reset to a **fresh empty line**, not a no-op—otherwise “Remove” looks broken on mobile.
- **RPC feedback**: **`save_sale`** returns **JSON** (`sale_id`, `total_amount`, …). The UI must **validate** that shape before calling **`formatInrDisplay`**, or users see **₹NaN** while the copy still says “success”.

### Level 2 — How it works

- **`parseSaveSaleResult`**: Check `typeof data === 'object'`, required string **`sale_id`**, and **finite numbers** for money fields. **`jsonNumber`** helper accepts numeric **strings** from JSON edge paths so you don’t fail on harmless coercion differences.
- **Partial success path**: If **`error` is null** but the payload doesn’t parse, the sale may still exist in the DB—show **amber** messaging and point to **Settings → Export sales** instead of fake green totals.

### Level 3 — Deep dive

- **Typing**: Supabase **`Database` generics** (CLI-generated) can narrow **`rpc()` returns**—reduces drift when the SQL function output changes.
- **Senior lens**: Treat **every RPC boundary** like an API contract: **validate at runtime** once, then narrow types; never **cast-and-pray** on money displayed to users.

---

## Dashboard module (V1) — read aggregates & KPI semantics

### Level 1 — Core concept

- **What**: The home dashboard shows **all-time** totals and top-product lists. Data comes from two **`SECURITY DEFINER`** RPCs: **`get_dashboard_kpis()`** (one result row of numbers) and **`get_top_products()`** (one **JSONB** object with two arrays).
- **Why server-side**: One round trip, **consistent math** for every user, and **no** shipping thousands of `sales` / `sale_items` rows to the browser to sum in JS. Same “compute near the data” idea as **`save_sale`**.
- **When**: Read-only **reporting** views where formulas are stable and RLS-scoped raw queries would be heavier or easier to get wrong in the client.
- **Fit**: Next.js **`app/page.tsx`** calls **`getDashboardKPIs`** / **`getTopProducts`** in `lib/queries/dashboard.ts`; UI is **`KPICard`** + **`TopProductsTable`**.

### Level 2 — How it works

- **Tenant scope**: Both functions require **`auth.uid()`**, resolve **`v_bid := current_business_id()`**, and filter **`business_id = v_bid`** with **`deleted_at IS NULL`** on **`sales`** and **`expenses`**. Same mental model as other definer RPCs: **trust boundary inside the function**, not “RLS only.”
- **KPI formulas (shipped)**:
  - **Total revenue** — `SUM(sales.total_amount)` for active sales.
  - **Total expenses** — `SUM(expenses.total_amount)` for active expenses.
  - **Gross profit** — **revenue − expenses** (business “money in minus money out,” *not* `SUM(sales.total_profit)`).
  - **Cash in hand** — **same numeric value as gross profit** in V1: **(all payment modes sales revenue) − (all payment modes expenses)**. Comment in SQL: *cash + online sales minus cash + online expenses* ≡ **total revenue − total expenses**.
  - **Online received** — `SUM(sales.total_amount) FILTER (WHERE payment_mode = 'online')`.
  - **Sales count** — `COUNT(*)` of active sales.
  - **Average sale value** — `total_revenue / sales_count`, or **0** if count is 0.
- **Top products**: **`sale_items` → `sales`** (active headers only) → **`products`** for name/variant. **Revenue** per product = **`SUM(sale_price * quantity)`**. **Margin %** = per-line **`((sale_price - cost_price_snapshot) / cost_price_snapshot) * 100`**, averaged per product; lines with **`cost_price_snapshot <= 0`** contribute **`NULL`** and are **excluded** from the average via **`avg(...) FILTER (WHERE line_margin_pct IS NOT NULL)`**.
- **Client parsing**: **`getTopProducts`** must **not** treat a bad JSONB shape as “empty top lists”—**return an error** so the dashboard shows a failure state instead of silent blank tables (mirror **`parseSaveSaleResult`** discipline).

### Level 3 — Deep dive

- **Why DEFINER for reads**: RLS still applies to direct table reads from the client; definer RPCs **centralize** aggregation logic and avoid N+1 or accidental omission of **`deleted_at`**. You still **must** code **`v_bid`** into every subquery—definer is **not** automatic tenant safety.
- **Archived products in top lists**: Join uses **`products`** as today; **historical lines** remain tied to product IDs. If RLS later hides archived product rows, **top lists could drop those names**—a V2 improvement is often a **snapshot label on `sale_items`** or a **definer-only** product lookup.
- **Performance**: Single pass per RPC; indexes on **`(business_id)`** and foreign keys matter at scale. **JSONB** response for top products avoids defining a composite PostgreSQL **RETURNS TABLE** type for two ranked lists.
- **Alternatives**: **Materialized views** per tenant (refresh jobs); **warehouse** (BigQuery, etc.) for heavy BI—overkill for V1.
- **Senior lens**: Dashboard RPCs are **part of the product contract**—when you change a column or formula, **version or migrate** intentionally; add **tests or SQL snapshots** for golden aggregates as data grows.

---

## Dashboard v2 — date range, payment split & resilient client loading

### Level 1 — Core concept

- **What**: The home dashboard is **scoped to a from–to date range** (default **YTD** in the browser calendar). **`get_dashboard_kpis(p_from, p_to)`** and **`get_top_products(p_from, p_to)`** return aggregates only for **`sales.date`** / **`expenses.date`** in that window (inventory value stays **point-in-time**, not range-filtered). The UI adds **cash vs online collections** from **`payment_mode`**, **sales by category**, and **top products by volume**—plus clearer naming so **net profit** is not confused with “cash in hand.”
- **Why**: Operators think in **periods** (month, quarter, YTD); V1 all-time totals misread seasonal businesses. Server-side range filters keep one source of truth and avoid shipping raw rows.
- **When**: Any reporting surface where “this quarter” must mean **the same thing** in SQL and UI.
- **Fit**: **`app/page.tsx`** + **`lib/queries/dashboard.ts`**; migration **`20260330140000_dashboard_v2_date_range.sql`** replaces **zero-arg** RPC signatures—client and DB must stay in lockstep.

### Level 2 — How it works

- **RPC contract**: Both functions **`raise`** if unauthenticated, missing dates, **`from > to`**, or **`current_business_id()`** is null. **`SECURITY DEFINER`** + **`SET search_path = public`**; **`REVOKE ALL … FROM public`**, **`GRANT EXECUTE … TO authenticated`**—same narrow exposure pattern as other definer entry points.
- **KPI semantics (v2)**: **`gross_profit`** = period revenue − period expenses; **`cash_collected`** / **`online_collected`** = **`SUM(total_amount)`** filtered by **`payment_mode`**—not the old ambiguous **`cash_in_hand`** name.
- **Client parsing**: **`getTopProducts`** already rejected malformed JSONB; **`getDashboardKPIs`** should return an **`Error`** if the row is missing or numeric fields don’t parse—never **`{ data: null, error: null }`**, or users see **“No dashboard data”** for a broken contract.
- **Auth & loading**: **`useBusinessSession`** runs **`getUser` + `profiles.business_id`** once with **`withTimeout`** and a **generation ref** so React **Strict Mode** double-mounts cannot leave **`loading`** stuck when an **old** async run resolves after cleanup. The home page should use the **same hook** as other shell routes—not a one-off session effect.
- **In-flight dashboard fetches**: **`withTimeout`** does **not** cancel Supabase HTTP—if the user changes the range quickly, a **slower older response** could still arrive. A **per-load generation counter** (`loadDashboardGenRef`): only the **latest** run may **`setKpis` / `setTopProducts` / `setLoadingDashboard(false)`** in **`finally`**. **`withTimeout`** uses a **`settled`** flag so a late fulfillment after timeout does not double-settle the outer Promise.
- **Logout**: After **`signOut`**, **`window.location.assign('/login')`** avoids “clicked Logout but UI stuck” when client routing or state is wedged.

### Level 3 — Deep dive

- **Strict Mode**: In dev, effects run **mount → cleanup → mount**. A **`cancelled` boolean** alone is fine for **one** effect, but if you **return early** without ever calling **`setStatus`**, a **second** in-flight promise from an earlier mount can still resolve and leave UI inconsistent—**generation refs** (compare **`gen === ref.current`**) are the durable pattern for **any** async bootstrap.
- **Timeouts vs AbortController**: **`withTimeout`** is **wall-clock abandonment** for UX, not network cancellation; the browser may still complete the request. For true cancel, you’d need fetch **`AbortSignal`** (where the client supports it) **plus** the same stale guard for any path that mutates React state.
- **Operational failure mode**: If the remote DB still has **old zero-arg** RPCs, PostgREST errors or hung behavior until migration **`20260330140000`** is applied—timeout copy can point PMs at that migration name.
- **Senior lens**: Treat **dashboard RPCs + `lib/queries` parsers** as one **versioned API**; ship migrations before or with the client change, and fail **loud** on shape drift instead of empty states.

---

## Bulk upload (V1 wrap-up) — templates, partial success, and dates

### Level 1 — Core concept

- **What**: Each module (Products / Expenses / Sales) provides a **CSV template** and a **CSV uploader** that inserts rows into Supabase.
- **Why**: Operations teams need fast backfills and historical imports; hand-entering is slow and error-prone.
- **Pattern**: **Partial success** — valid rows insert, invalid rows are skipped with a downloadable **error CSV**.
- **Fit in this codebase**:
  - Templates + upload UI live on module pages and in Settings.
  - Shared parsing helpers live in `lib/importCsv.ts`.

### Level 2 — How it works (and why)

- **CSV parsing**: `parseCsv()` parses quoted CSV and returns `headers + rows` as strings. Helpers (`getString`, `getRequiredNumber`, etc.) normalize values before validation.
- **True partial success** (important): doing a single `insert(validRows)` can fail the entire batch if one row violates a constraint.
  - **Fix shipped**: Insert **row-by-row** and collect row-level errors into `ImportIssue[]`, then export errors via `buildImportIssuesCsv()`.
- **Dates**:
  - Sales uses a Postgres `date` column. Expenses uses `timestamptz`.
  - We normalize user-provided CSV dates using:
    - `normalizeDateYmd()` → `YYYY-MM-DD` for `date`
    - `normalizeDateTimeIso()` → ISO for `timestamptz` (date-only becomes local midnight)
  - Supported formats are intentionally flexible (e.g. `YYYY-MM-DD`, `DD/MM/YYYY`, ISO datetime) so imports can include **historical/future** dates.

### Level 3 — Deep dive (production behavior)

- **Calendar-valid dates**: naive string normalization accepts impossible dates (e.g. `31/02/2026`).
  - **Fix shipped**: Validate Y/M/D via UTC round-trip (`Date.UTC`) so only real calendar days pass.
- **Error reporting**:
  - `ImportIssue` tracks **CSV row number** (1-based with header row), a field label, and a message.
  - Error CSVs let ops fix only failed rows and re-upload.
- **Tradeoffs**:
  - Row-by-row inserts are slower than a single insert but are safer and match “partial success” UX.
  - If imports become large (10k+ rows), switch to chunking + per-row savepoints via RPC, or staging tables + server-side validation.

---

## Vendors module (V2 slice — prd.v2.4.2)

### Level 1

- **What**: `public.vendors` is a per-tenant directory (`business_id`, unique `(business_id, name)`). Expenses always store `vendor_name` (required text); optionally `vendor_id` links a row to the directory for roll-ups on the vendor detail page.
- **Why**: Picking from the directory keeps history consistent; free-text names support one-off suppliers without creating directory rows.
- **Rule**: Typing a different name or clearing the picker sets `vendor_id` to **null** — the app does **not** auto-create vendors from expense text.

### Level 2

- **New columns** (nullable): `contact_person`, `address`; `email` / `phone` / `notes` remain optional.
- **Bulk import**: Same partial-success pattern as Products — `template_vendors.csv` columns `name,contact_person,phone,address,notes,email`; row-by-row `INSERT` under RLS; `vendors_import_errors.csv` on failures.
- **Vendor detail expenses**: Includes rows with `vendor_id = this vendor` **or** legacy/free-text match on `vendor_name` (case-insensitive) when `vendor_id` is null.

### Level 3

- **Migration `20260327200000_vendors_contact_address.sql`** (evolved from ALTER-only):
  - **Problem**: An `ALTER TABLE vendors …` migration **fails** if `public.vendors` was never created (e.g. `20260326120000_inventory_vendors.sql` not applied on that database).
  - **Pattern shipped**: `CREATE TABLE IF NOT EXISTS` with the **baseline** directory shape (name, phone, email, notes, timestamps, unique `(business_id, name)`), then `ADD COLUMN IF NOT EXISTS` for `contact_person` / `address`, then RLS + trigger parity with the inventory migration’s vendors section.
  - **Expenses**: `ADD COLUMN IF NOT EXISTS` for `vendor_id` (and `product_id` so `expenses_validate_refs` can reference both), indexes, and **idempotent** `CREATE OR REPLACE` + trigger for `expenses_validate_refs`. Does **not** replace inventory-only pieces (`inventory` table, `expenses_sync_inventory`, `save_sale` stock)—those stay in `20260326120000` when you need stock.
- **Greenfield `schema.sql`**: Includes full `vendors` table + `expenses.vendor_id` / `expenses.product_id` FKs for consistency with the inventory track.

### Navigation (shell) — single source

- **`lib/nav.ts`**: Exports `MAIN_NAV_ITEMS` and `isMainNavActive()`. **`AppShell`** renders the same items on **desktop sidebar** and **mobile left Sheet** (menu FAB toggles); one module edit updates both.
- **`components/layout/Sidebar.tsx`**: Older standalone spec; **not** wired by `AppChrome` today—if reused, keep its `NAV_ITEMS` aligned with `MAIN_NAV_ITEMS` or delete to avoid drift.

### Local development — Next.js dev server

- **Symptom**: `http://localhost:3000` returns **HTTP 500** while the same app on another port (e.g. `npm run dev -- -p 3010`) returns **200**.
- **Likely cause**: Stale **`.next`** cache, a **zombie `node`** still bound to the port, or a crashed/half-dead dev process—not necessarily application logic.
- **Mitigation**: Kill listeners on the port (`lsof -ti :3000 | xargs kill -9` on macOS), **`rm -rf .next`**, run **`npm run dev`**, open the exact **Local:** URL printed in the terminal (use `http`, not `https`).

---

## Manual inventory (`inventory_items`, prd.v2.4.3)

### Level 1

- **`public.inventory`**: Ledger per product; **sales** and **expenses** automation adjusts **`quantity_on_hand`** here (not `current_stock` — that name is on **`inventory_items`** only).
- **`public.inventory_items`**: Operator-facing lines (display name, unit, **`unit_cost`**, **`reorder_level`**, optional **`product_id`**). Rows **without** **`product_id`** do not receive sale/expense stock deltas.
- **No `deleted_at` on `inventory_items`:** unlike **`products`** / **`sales`**, this table uses **hard delete** from **`/inventory`** (no soft-archive column). **Do not** use **`.is('deleted_at', null)`** in PostgREST queries — Postgres error *column … does not exist* + red toast (fixed on Products component-picker load).
- **Component stock vs PRD “warn + allow”:** `inventory_items.current_stock` has **`CHECK (current_stock >= 0)`** and sync to **`public.inventory`** enforces non-negative ledger; **overselling components** stays **RPC-blocked**. Sales UI adds **warnings** only (`saleComponentHints` + toasts).
- **Sync**: When **`product_id`** is set, triggers keep **`inventory_items.current_stock`** and **`public.inventory.quantity_on_hand`** aligned (bidirectional; loop avoided by comparing old/new with **`IS DISTINCT FROM`**). Sales must call **`inventory_apply_delta`** inside **`save_sale`** so the ledger moves; migration **`20260329103000_save_sale_restore_inventory_delta.sql`** restores that if an older **`save_sale`** rewrite dropped it.

### Level 2

- **CSV** (`template_inventory.csv`): `name`, `unit`, `current_stock`, `unit_cost`, `reorder_level`, `product_lookup`, `add_to_products` (boolean; header alias **`add_to_section`** accepted). **`product_lookup`** uses the same name/variant keying as Sales bulk import. **`add_to_products` true** with no lookup match inserts a stub **Product** (`category = 'GENERAL'`, **`mrp`** / **`cost_price`** from row **`unit_cost`**).
- **UI**: Low-stock row styling when **`reorder_level`** is set and **`current_stock <= reorder_level`**.

### Level 3

- **Migration `20260328120000_inventory_items.sql`**: **`inventory_items`** table, tenant RLS, partial unique **`(business_id, product_id)`** where **`product_id` IS NOT NULL**, **`inventory_items_push_to_ledger`** + **`inventory_pull_to_items`** trigger wiring.
- **Migration `20260329120000_inventory_sync_triggers_security_definer.sql`**: Both sync functions must be **`SECURITY DEFINER`** so updates that originate inside **`inventory_apply_delta`** / **`save_sale`** are not blocked by RLS on **`inventory`** / **`inventory_items`**.

### RLS vs SECURITY DEFINER (why sync triggers are definer)

#### Level 1

- **RLS** filters rows per tenant using **`auth.uid()`** / **`current_business_id()`** — the default for app traffic through PostgREST.
- **`save_sale`** and **`inventory_apply_delta`** are **`SECURITY DEFINER`** so stock math runs reliably with ledger access inside an RPC.
- **Sync triggers** copy between **`inventory`** and **`inventory_items`**; if they stay **`INVOKER`**, RLS can **block** those writes **silently** (0 rows updated). **`SECURITY DEFINER`** on **`inventory_pull_to_items`** / **`inventory_items_push_to_ledger`** fixes that while **`WHERE`** clauses stay tied to **`NEW.business_id`** / **`NEW.product_id`**.

#### Level 2

- **Silent failure mode**: trigger **`UPDATE`** passes RLS → no match → no error → UI looks “stuck.” Always verify **ledger** changed first, then **line** + **`product_id`** link.
- **Regression mode**: replacing **`save_sale`** without **`perform inventory_apply_delta`** breaks the whole chain even if triggers exist.
- **Design tradeoff**: definer triggers are **trusted code** — keep them minimal; **`SET search_path = public`** reduces hijack risk.

#### Level 3

- **Transactions**: failed **`inventory_apply_delta`** (e.g. negative stock) aborts **`save_sale`** entirely. **BOM products**: **`inventory_apply_delta`** treats **negative** deltas as a **no-op** when **`product_components`** exists for that **`product_id`** (assembly stock is on **`inventory_items`** only; migration **`20260402110000`**).
- **Loop control**: **`IS DISTINCT FROM`** on pull avoids redundant **`inventory_items`** updates when the value is already aligned.
- **Alternatives**: app-only sync (weaker if SQL/RPC bypasses app), single-table + views (simpler reads, bigger schema change).

### Next.js dev — “looks like plain HTML”

#### Level 1

- Styled UI depends on **`/_next/static/css/...`** loading. If that request **fails** (often **500**), Tailwind/global CSS never applies → **unstyled** page (default fonts, blue links).

#### Level 2

- **Corrupt `.next`** (e.g. **`Cannot find module './72.js'`**) can break **CSS** and other routes. **`rm -rf .next`** + **one** **`npm run dev`** instance fixes most cases.
- **Two dev servers** (e.g. **3000** broken, **3001** fine) → user hits the wrong port and sees errors or stale assets.

#### Level 3

- Confirm in **DevTools → Network** that **`layout.css`** (or linked CSS) is **200**, not **500**/**404**. Use **`npm run dev:clean`** (script in **`package.json`**) when diagnosing.

### React — async `useEffect` and import errors

#### Level 1

- **`useEffect`** that **`await`s** auth/profile should use a **mounted flag** (or abort) so **`setState`** does not run after unmount (avoids warnings/races).

#### Level 2

- **`devError`** (**`lib/devLog.ts`**) logs **`catch`** details **only in development** so PMs/devs see stack traces without shipping **`console`** noise to production users who already get toasts.

---

## Mobile polish — accordion lists, a11y, and client patterns (prd.v2.mobile-polish)

### Level 1 — Core concept

- **What**: Below **`md`**, several modules render **`…MobileList`** accordions instead of (or beside) wide **`<Table>`**s: **Sales**, **Expenses**, **Products**, **Inventory**, **Vendors**. Each row shows a **summary**; tap toggles **details** (and keeps **edit / archive / link** on the summary where possible).
- **Why**: Avoid horizontal scroll and tiny table cells on phones; match how operators scan **one entity at a time**.
- **When**: Any multi-column list where **mobile reading order** differs from desktop columns (this codebase: `md:hidden` / `hidden md:block` splits on pages).
- **Fit**: Shared primitives in **`components/mobile/MobileAccordion.tsx`** (`MobileAccordionChevron`, `MobileAccordionBody`); dashboard home uses **responsive padding/type** on **`app/page.tsx`** + **`components/dashboard/*`** (same “slightly smaller on mobile” product goal, no accordion).

### Level 2 — Mechanics, tradeoffs, debugging

- **State**: Typically **`useState<string | null>(null)`** for **`openId`** — **one open row** per list, predictable UX and minimal re-renders.
- **Animation**: **`MobileAccordionBody`** uses **`grid-template-rows: 0fr` ↔ `1fr`** with **`motion-reduce:transition-none`** so **prefers-reduced-motion** users are not forced through long transitions.
- **React keys**: Every **`.map()`** row needs a **stable `key`** (e.g. **`expense.id`**, **`product.id`**). **`SalesMobileList`** line blocks key off **`sale_items.id`** (exposed as **`SaleListLineDetail.id`** in **`lib/queries/salesList.ts`**) — **not** array index — so refetches/reorders don’t reuse the wrong row subtree.
- **Lookups**: **`InventoryMobileList`** uses **`useMemo(() => new Map(products.map(…)), [products])`** instead of **`products.find`** per row — **O(1)** per link vs **O(n×m)** when catalogs grow.
- **DRY**: **Catalog margin %** (MRP vs cost, tone classes) lives in **`lib/products/productMargin.ts`** (`getProductMargin`, `productMarginToneClass`) for **`ProductsMobileList`** and **`app/products/page.tsx`** table rows.
- **Tradeoffs**: Dense single-line summaries rely on **`truncate` / `line-clamp`** — long labels need expand or drill-down (e.g. vendor **`<Link>`** with **`stopPropagation`** so navigation doesn’t toggle the accordion).
- **Debug**: Wrong row “stuck” open → check **missing `key`** or **parent remount**; inventory shows wrong link → **`product_id` present but product missing from client `products` array** (treat as unlinked in UI until data is consistent).

### Level 3 — Production behavior, a11y, scaling

- **Accessibility**: Row **`button`**s set **`aria-expanded`**; optional **`contentId`** on **`MobileAccordionBody`** sets **`id` + `role="region"`** on the panel; the toggle sets **`aria-controls={contentId}`**. The animated wrapper uses **`aria-hidden={!open}`** so collapsed content is de-emphasized for SR while remaining in the DOM for the height animation.
- **Sales vs others**: **`SalesMobileList`** still owns its **expand grid** markup (historical / layout reasons); other lists use **`MobileAccordionBody`** — same pattern, two implementations; merging would reduce duplication but is a deliberate refactor.
- **Performance**: All lists are **plain maps** over arrays — fine at V1 volumes; **very large** lists may need **pagination** or **virtualisation** later.
- **Contract changes**: Adding **`id`** to **`fetchSalesList`** line payloads is a **typed contract** — any test or story that builds **`SaleListLineDetail`** must supply **`id`**.
- **Senior lens**: **`md`** is a **product breakpoint** (shell + list mode), not an ad-hoc class — changing it ripples across **every** table/mobile split. Keep **server truth** (RLS, IDs) authoritative; mobile components stay **presentational**.

---

## Client loaders — Supabase errors vs silent empty UI

### Level 1 — Core concept

- **What**: When a client component **fetches reference data** (vendors, products, profile embeds) and the query returns **`error`**, the UI should **not** behave like “there’s nothing to pick”—that misreads **RLS**, network, or schema issues as empty catalogs.
- **Why**: Operators need a **signal** that loading failed; otherwise they waste time creating duplicates or assume the product is “broken.”
- **When**: Any **`useEffect`** / callback that **`await`s** Supabase and sets list state—e.g. **`ExpenseForm`** (`loadVendors`, `loadProducts`), **`AppShell`** (sidebar **business name** from **`profiles` → `businesses(name)`**).
- **Fit**: **Sonner** **`toast.error(message)`** matches save/archive flows; optional **`devError`** from **`lib/devLog.ts`** adds **dev-only** console detail without shipping noise to end users.

### Level 2 — How it works

- **Mechanics**: On **`PostgrestError`** (or query helper error), call **`toast.error(err.message || '…fallback…')`** and **return** before **`setState`** with stale/empty assumptions. Keep **user-facing** copy short; Supabase often surfaces useful **`message`** (permission, missing column, etc.).
- **Cancelled async**: In **`useEffect`** with a **`cancelled`** flag, **check `cancelled` before toasting** so unmount / Strict Mode does not fire toasts for abandoned requests. Split **`if (cancelled || error) return`** into **`if (cancelled) return`** then **`if (error) { … toast … return }`**.
- **Tradeoffs**: A toast on **every** failed mount can feel noisy if something is **persistently** misconfigured—still better than silent failure; a follow-up is **inline retry** or **deduped** error state if needed.
- **Edge cases**: **`error` null** but **`data` unexpected** is a different bug (parsing/validation); **`maybeSingle()`** wrong-shape rows may not set **`error`**—handle with defensive parsing + optional “could not read business” messaging later if observed.
- **Debug**: Reproduce with **wrong RLS** or **offline**; confirm toast + (in dev) **`devError`** context string (e.g. **`AppShell business name`**).

### Level 3 — Deep dive

- **Production**: **`devError`** is **`NODE_ENV === 'development'`** only—production users rely on **toast** (and whatever logging you add server-side separately).
- **Performance**: One extra **`toast.error`** per failed request is negligible; avoid **awaiting** loaders in a tight loop without batching.
- **Alternatives**: **Inline `Alert`** or form-level **`error` state** instead of toast—good when the failure is **scoped to one form**; **global** shell fetches often still use toast because there’s no single field to attach to.
- **Senior lens**: Treat **“empty picker after load”** as a **product smell** unless you’ve explicitly distinguished **empty catalog** (zero rows, no error) from **failed load**—always branch on **`error`** first, then render empty state.

---

## Sales RPCs — PostgREST schema cache, `archive_sale` / `update_sale`, client fallback

### Level 1 — Core concept

- **What**: **PostgREST** (Supabase’s REST layer) exposes Postgres **functions** as `/rpc/...` only after they exist in the DB **and** appear in PostgREST’s **schema cache**. New migrations that `CREATE OR REPLACE` **`archive_sale`** / **`update_sale`** do nothing for the browser until that project has **applied** the migration and the API has **reloaded** its schema (often automatic; sometimes you nudge it).
- **Why errors look weird**: “**Could not find the function … in the schema cache**” means the **API** doesn’t know that signature yet—not necessarily that your repo is wrong. **`PGRST202`** is the usual code.
- **`archive_sale` vs `update_sale`**: **`archive_sale`** soft-deletes the **`sales`** header and **restores stock** per **`sale_items`** line: **product ledger** via **`inventory_apply_delta`** only when the product has **no** **`product_components`** rows; **component** stock is always adjusted on **`inventory_items`**. **`update_sale`** **replaces** header + lines in one transaction (restore old quantities, delete lines, re-insert, apply new deltas)—same BOM vs ledger split as **`save_sale`** (migration **`20260402100000`**).
- **Product names:** Uniqueness is **among active products only** (**`products_business_id_name_active_uidx`**, **`deleted_at IS NULL`**); archived SKUs do not block reusing the same display name.
- **Client fallback** (**`lib/archiveSale.ts`**): If **`archive_sale`** fails with a **missing-RPC** pattern, the app **approximates** archive: lines **without** a BOM use **`inventory_apply_delta_for_tenant`**; lines **with** **`product_components`** bump **`inventory_items.current_stock`** by **`quantity_per_unit × qty`**, then **`UPDATE sales SET deleted_at`**. **Editing** a sale still **requires** **`update_sale`** on the server—**`sale_items`** has **no** client INSERT/DELETE policies by design (**`20250326120000_foundation_soft_delete_sales_rpc.sql`**).

### Level 2 — Mechanics, pitfalls, debugging

- **Migration anchor**: **`20260401160000_sale_archive_update_inventory_delete_rpc.sql`** defines **`archive_sale`**, **`update_sale`**, and related inventory RPCs; ship with **`supabase db push`** or run the file in the **SQL editor** for the **same** project as **`NEXT_PUBLIC_SUPABASE_URL`**.
- **Schema reload**: **`20260401180000_postgrest_reload_schema.sql`** runs **`pg_notify('pgrst', 'reload schema')`** to refresh PostgREST; if your migration role can’t notify, use Supabase docs / dashboard equivalents. After deploy, **hard-refresh** the app.
- **Hints** (**`lib/saleRpcUserHint.ts`**): **`isPostgrestMissingRpcError`** detects cache/catalog “missing function” messages; **`saleRpcUserHint`** appends the migration filename. Used for **`update_sale`** errors in **`SalesForm`**; archive uses fallback when the detector fires.
- **RLS + PATCH RETURNING**: Do **not** chain **`.select()`** on a client **`update({ deleted_at })`** for **`sales`**—returned rows must pass **SELECT** RLS (**`sales_select_active`** requires **`deleted_at IS NULL`**), which produces **“new row violates row-level security”**-style failures. **Fix:** update **without** `.select()`, then verify with a **separate** read (see **Soft delete, RLS … RETURNING + SELECT RLS** above). **`lib/archiveSale.ts`** follows this pattern.
- **Tenant safety on fallback**: **`inventory_apply_delta_for_tenant`** checks **`p_business_id`** against **`current_business_id()`** (**`Business mismatch`** if spoofed)—passing **`session.businessId`** from the client is **not** a cross-tenant escape hatch when the function is deployed.
- **Failure mode (fallback)**: Client path is **not one DB transaction**—partial progress (some deltas applied, **`deleted_at`** not set) can **over-restore** ledger vs sale state. Treat fallback as **degraded**; production should rely on **`archive_sale`**.

### Level 3 — Production notes

- **Detector**: **`isPostgrestMissingRpcError`** uses PostgREST/Postgres codes (**`PGRST202`**, **`42883`**) plus narrow message checks (**schema cache** + function/procedure, or **function** + **does not exist**).
- **Senior lens**: Prefer **one SECURITY DEFINER RPC** per multi-step mutation (**atomic**, consistent with **`save_sale`**). Client fallbacks are **product continuity**, not the architectural end state; **`update_sale`** cannot be replicated from the browser without widening **`sale_items`** RLS (usually a bad trade).

---

## Sales, BOM, and inventory — dual stock model (ledger vs components)

### Level 1 — Core concept

- **What**: This app tracks **sellable SKU stock** in **`public.inventory`** (**`quantity_on_hand`** per **`product_id`**) and **raw / component stock** in **`inventory_items`** (**`current_stock`** per manual line, optionally linked to a product). **BOM** rows in **`product_components`** say: “selling one unit of product **P** consumes **N** of inventory item **I**.”
- **Why it’s easy to get wrong**: Operators stock **only** components on **Inventory**, but the **original** sale path always tried to decrement **`public.inventory`** for **P** first—so they saw **“Insufficient stock…”** even when components were fine. That message is about the **product ledger**, not component lines.
- **When to use BOM**: Finished goods you **assemble from parts** (kits, gift bundles, food components) where you **don’t** maintain finished-goods quantity in the ledger—only parts.
- **Fit**: **`save_sale` / `update_sale`** (migrations **`20260402100000`**+) skip **`inventory_apply_delta`** for **P** when **P** has any **`product_components`**; **`inventory_apply_delta`** itself also **no-ops negative deltas** for those products (**`20260402110000`**) so older RPC bodies still behave. Component deduction stays **`UPDATE inventory_items`**.

### Level 2 — How it works

- **Mechanics**: For each sale line, the server loads **`product_components`** for **`product_id`**. If **no rows** → **`inventory_apply_delta(business, product, -qty)`** (classic sellable SKU). If **rows exist** → skip that ledger decrement; loop components and subtract **`quantity_per_unit × qty`** from **`inventory_items.current_stock`**, with **non-negative** enforcement there.
- **Triggers**: **`inventory_items_push_to_ledger`** runs when **`inventory_items.product_id`** is set—it **mirrors** that row’s **`current_stock`** into **`public.inventory`** for that product. **Unlinked** component rows (**`product_id` null**) do **not** push—typical for parts that aren’t the sellable SKU.
- **Product names**: Global **`UNIQUE (business_id, name)`** included **archived** products, so “duplicate name” errors appeared with **no visible row**. **Partial unique index** (**`WHERE deleted_at IS NULL`**) fixes that without hard-deleting history.
- **Client hints**: **`fetchComponentShortfallsForLines`** projects shortage **per component**; it must **aggregate** demand across **all lines** (same product twice or shared components) before comparing to **`current_stock`**, or warnings lie.
- **Debug**: Confirm **`product_components`** rows in DB; confirm migrations through **`20260402110000`** on the **same** Supabase project as the app; read **`pg_get_functiondef('inventory_apply_delta…')`** if unsure what’s deployed.

### Level 3 — Deep dive

- **Tradeoff (hybrid SKUs)**: If a product **both** has a BOM **and** you keep **finished** stock in **`public.inventory`**, skipping ledger on sale means **ledger no longer tracks** finished units—you’re “components-only” for that SKU. That’s an intentional product rule here; a flag or separate product split would be needed for true hybrid tracking.
- **Archive / edit symmetry**: **`archive_sale`** and **`update_sale`** must **restore** component **`inventory_items`** and only **restore** product ledger when **no BOM**—otherwise you double-count or leak stock. Client **`archiveSaleWithClientFallback`** mirrors that split but is **not transactional**.
- **Performance**: Shortfall aggregation is **O(lines × BOM rows)** client-side; fine at current volumes. **`fetchCustomersList`**-style merges for the sales picker are heavier—acceptable until row counts explode.
- **Senior lens**: **Inventory is two systems** (ledger + items) **plus** triggers that keep subsets in sync—bugs often show up as “wrong error message” (ledger) vs “real” constraint (components). Teach operators **which screen** is authoritative for which SKU type, and treat **migration drift** as a first-class ops checklist (**`schema_migrations`**, **`migration list`**).

---

## Customers module (V3) — canonical identity, sales aggregation, and record lifecycle

### Level 1 — Core concept

- **What**: The Customers page is a **derived view** built from two sources: canonical rows in `customers` and transactional rows in `sales`.
- **Why**: Historical sales can exist without a `customers` row (`customer_id` null, only phone/name on sale), so a pure `customers` query misses real buyers.
- **When**: Use this pattern when identity quality evolves over time (legacy data + newer normalized relations).
- **Fit**: We show one customer row per stable identity, with totals/order count from sales, while still allowing row-level customer management (edit/delete/create).

### Level 2 — How it works

- **Identity strategy**: Aggregate sales by `customer_id` first, else by normalized `customer_phone`, else as sale-unique fallback (`sale:<id>`). This avoids incorrect merges.
- **Important tradeoff**: We intentionally **do not merge by name**; same name does not imply same person.
- **Directory completeness**: After sales aggregation, append persisted `customers` rows with zero orders so the directory is complete even without sales.
- **Lifecycle controls**:
  - Rows with `customerId` support **Edit/Delete** (soft delete via `deleted_at`).
  - Sales-only rows expose **Create Record** to promote them into canonical `customers`.
- **Order history query**: Fetch by multiple match paths (`customer_id`, phone, name fallback) and de-duplicate by `sale.id`.

### Level 3 — Deep dive

- **Production behavior**: “Customer list” is a **projection**, not a base table. Any bug in keying logic becomes a reporting bug (wrong counts, wrong merges).
- **Data quality implications**: Phone is the practical natural key in this product; if phone is missing/dirty, rows stay non-canonical until user creates/fixes records.
- **Scaling**: Current client-side merge is fine at V1 volumes. At higher volumes, push aggregation into a DB RPC/view with indexed filters and deterministic key rules.
- **Alternatives**:
  - Strict canonical-only list (cleaner but hides legacy sales customers).
  - Full ETL backfill job to guarantee every sale has `customer_id` (best long-term, more migration complexity).
- **Senior lens**: Treat identity resolution rules as a product contract. Version rule changes carefully because they affect KPIs, repeat-customer counts, and user trust.
