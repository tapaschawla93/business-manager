# Feature Implementation Plan: Tenant sale tags + dashboard filter (all KPIs)

**Overall Progress:** `100%`

## TLDR

- Add a **required**, **non–free-text** tag on every **sale** and **expense**, backed by a tenant **`sale_tags`** dictionary and a **default tag per business** (`businesses.default_sale_tag_id` or equivalent).
- **Dashboard** keeps the **same layout**; **all KPIs** (revenue, expenses, derived nets, inventory value policy below, top products, monthly series) **scope to the selected tag** via a new control (**All** = union of all tags / whole business — see decisions).
- **Sales UI**: tag **Combobox** at sale time (required, default pre-selected); **“Add tag”** inserts into **`sale_tags`** and selects it for this sale.
- **Bulk sales upload**: include a **tag** column; validate against **`sale_tags`** (or apply default only if you allow omit — **you chose required**, so validate or default in parser).

## Critical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **All KPIs follow tag** | **Sales and expenses** both carry the same tag dimension; dashboard RPCs filter **both** `sales` and `expenses` when a tag is selected. | You asked for expenses, revenue, and everything to change with the tag. |
| **`inventory_value`** | **Not tag-filtered** (remains tenant-wide snapshot) unless you later tag inventory moves. | Inventory value is point-in-time stock; it isn’t naturally “under” a sale tag. **Optional follow-up:** label the card “All inventory” when a tag filter is active, or hide it — confirm in implementation. |
| **No free typing** | Tag on row must resolve to **`sale_tags`**; optional **`sales.sale_tag`** = `text` **CHECK** / lookup against allowed set, or **`sale_tag_id uuid` FK** (stricter). | Prevents typos; dropdown-only + “Add tag” flow. |
| **Default required** | **`businesses.default_sale_tag_id`** (FK `sale_tags`) **NOT NULL** after backfill; app always sends default in RPC if user doesn’t change selection; **`sales.sale` / id NOT NULL** at DB or via RPC. | “If person not doing anything, required should be chosen.” |
| **“Add tag”** | Same screen as sale: modal/inline **creates** `sale_tags` row, then **selects** it (available next sale in list). | Matches your UX. |
| **All vs tag on dashboard** | **All** = no tag predicate (entire business in range). **Tag X** = `sales` and `expenses` rows where tag = X only. | Clear semantics; legacy rows need backfill before NOT NULL. |

## Tasks

- [x] 🟩 **Step 1: Schema + seed**
  - [x] 🟩 New **`sale_tags`** (`id`, `business_id`, `label` or `name`, `created_at`, **unique (business_id, normalized label)**).
  - [x] 🟩 **`businesses.default_sale_tag_id`** `uuid` FK → `sale_tags` (nullable until backfill; then **NOT NULL** or enforced in app + migration).
  - [x] 🟩 **`sales.sale_tag_id`** `uuid NOT NULL` FK → `sale_tags` (preferred) **or** `sale_tag text NOT NULL` + FK/trigger to master — pick one in impl.
  - [x] 🟩 **`expenses.expense_tag_id`** (or `sale_tag_id`) `uuid NOT NULL` FK → **`sale_tags`** (same dictionary for “transaction tag”).
  - [x] 🟩 **Backfill:** For each business, insert one default tag (e.g. “General”), set `businesses.default_sale_tag_id`, set **all existing** `sales` / `expenses` to that tag, then add **NOT NULL** if using FK column.
  - [x] 🟩 RLS on **`sale_tags`**: select/insert/update/delete mirroring **`vendors`** / **`customers`**.

- [x] 🟩 **Step 2: RPCs**
  - [x] 🟩 **`save_sale` / `update_sale`**: New param **`p_sale_tag_id uuid`** (required); validate row belongs to `current_business_id()`; insert/update header.
  - [x] 🟩 **Expense insert/update** (client direct table or RPC): ensure **`expense_tag_id`** set (default from business when user doesn’t pick); validate FK.
  - [x] 🟩 **`get_dashboard_kpis(p_from, p_to, p_sale_tag_id uuid default null)`**: When `p_sale_tag_id` **is null** → current behavior on **all** sales/expenses in range. When **set** → filter **`sales`** and **`expenses`** by that id. Keep **`inventory_value`** as today (see decision) or add UI note.
  - [x] 🟩 **`get_top_products`**, **`get_monthly_performance`**: Same optional `p_sale_tag_id`; filter **sales** CTEs; **monthly expenses** CTE filtered by tag too.
  - [x] 🟩 **`GRANT` / `REVOKE`** + replace function signatures in **`supabase/schema.sql`** and new migration.

- [x] 🟩 **Step 3: Types + queries**
  - [x] 🟩 **`lib/types/sale.ts`**, **`Expense`** types, **`fetchSalesList`** select + **`SaleListRow`**.
  - [x] 🟩 **`lib/queries/dashboard.ts`**: pass **`saleTagId`** (null = All) into all three RPCs.
  - [x] 🟩 Helper: **`fetchSaleTags(supabase)`** for combobox + **`createSaleTag`** for “Add tag”.

- [x] 🟩 **Step 4: UI — Sales**
  - [x] 🟩 **`SalesForm`**: Required **Tag** control (Combobox); load tags + **business default** selected on new sale; edit sale loads existing tag.
  - [x] 🟩 **“Add tag”** at same spot: creates tag, refreshes list, sets selection.
  - [x] 🟩 **`app/sales/page.tsx`**: Table column / mobile badge for tag; CSV import column **required** or default tag **explicitly** applied with validation against master.
  - [x] 🟩 **`lib/excel/workbookSchema.ts`** + **`uploadWorkbook.ts`**: Sales sheet column for tag id or label (match validation strategy).

- [x] 🟩 **Step 5: UI — Expenses**
  - [x] 🟩 **`ExpenseForm`** (and mobile): same tag control, **default** pre-selected, **required** before save.
  - [x] 🟩 Bulk expense CSV / workbook if present: tag column + validation.

- [x] 🟩 **Step 6: UI — Dashboard**
  - [x] 🟩 **`app/page.tsx`** + **`DashboardDateRangeControl`** (or sibling): **Select** “All” vs each **`sale_tags`** row for business; store **`selectedTagId: string | null`** (`null` = All).
  - [x] 🟩 Pass **`selectedTagId`** into **`loadDashboard`**; **no layout changes** — only RPC args + loading state.

- [x] 🟩 **Step 7: Settings (optional but recommended)**
  - [x] 🟩 Card to **manage tags** (rename/archive) and set **default tag** (`businesses.default_sale_tag_id`).

- [x] 🟩 **Step 8: Docs**
  - [x] 🟩 **`CHANGELOG.md`**, **`docs/knowledgebase.md`** (tag semantics, dashboard “All”, inventory caveat).

## Risks / open micro-choices

- **Inventory KPI** when tag ≠ All: still full-tenant or labeled — **confirm** in Step 4 UI copy.
- **Archive sale / historical import:** Archived sales keep tag; imports must supply tag or server applies default.
- **PostgREST cache** after RPC signature changes: reload schema / `db push` note.

## Implement later (out of scope unless you ask)

- Per-tag **inventory** or cost allocation.
- Separate **expense-only** tag dictionary (you chose **one** dictionary for both).
