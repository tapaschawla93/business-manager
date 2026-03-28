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

- **`lib/nav.ts`**: Exports `MAIN_NAV_ITEMS` and `isMainNavActive()`. **`AppShell`** (desktop sidebar) and **`MobileBottomNav`** both import **only** this module, so adding a route (e.g. `/vendors`, **`/inventory` last**) updates **two surfaces with one edit**.
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

- **Transactions**: failed **`inventory_apply_delta`** (e.g. negative stock) aborts **`save_sale`** entirely.
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
