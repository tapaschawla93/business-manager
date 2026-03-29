# Feature Implementation Plan — Expense category, catalog-only inventory, stock-purchase workflow

**Overall Progress:** `100%`

## TLDR

Add **`expenses.category`** (nullable text) for non-inventory spend; introduce **`sync_product_cost_from_expense`** (SECURITY DEFINER RPC, **called from the app** after expense save) to align **`products.cost_price`** and **`inventory_items.unit_cost`** with the latest stock-purchase unit cost. Refactor **inventory** add/edit to **catalog-only** (mandatory **`ProductPicker`**, default **`unit = 'pcs'`**, **delta “Units to Add”** on create, **absolute stock** on edit, duplicate-product guard). Refactor **expenses** into a top **“Stock Purchase”** switch: two layouts (non-inventory vs stock purchase), simplified non-inventory amount UX, and **`ExpenseList`** updates (category column, stock badge from **`update_inventory`**).

## Critical Decisions

- **Decision 1: Cost sync via RPC, not a new trigger** — Spec calls **`sync_product_cost_from_expense`** from application code after successful insert/update for stock purchases; keep existing **`expenses_sync_inventory`** and **`inventory_items_push_to_ledger`** unchanged.
- **Decision 2: Inventory product immutability on edit** — Existing rows: product picker **read-only**; changing **`product_id`** is out of scope (re-add flow if ever needed).
- **Decision 3: Non-inventory expense shape in DB** — **`quantity = 1`**, **`unit_cost = total_amount`**, **`product_id` null**, **`update_inventory = false`**, **`category`** optional string; stock purchase sets **`item_description`** from product name, **`category = null`**.
- **Decision 4: Vendor UX** — Prefer **clean form**: **`VendorPicker`** optional; if removing standalone vendor name would hurt ops, show **optional free-text name only when no directory vendor** is selected (read spec + current **`ExpenseForm`** before choosing).
- **Decision 5: Greenfield parity** — After migration, align **`supabase/schema.sql`** with **`expenses.category`** and **`sync_product_cost_from_expense`** (same pattern as other features in this repo).

## Tasks

- [x] 🟩 **Step 1: Database — `20260401000000_expense_category_product_cost_sync.sql`**
  - [x] 🟩 `ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category text`
  - [x] 🟩 `CREATE OR REPLACE FUNCTION public.sync_product_cost_from_expense(...)` (SECURITY DEFINER, `search_path = public`; updates **`products`** + **`inventory_items`** by **`business_id`** / **`product_id`**)
  - [x] 🟩 `REVOKE ALL … FROM public`; `GRANT EXECUTE … TO authenticated`
  - [x] 🟩 Update **`supabase/schema.sql`** to match (no other trigger/RLS changes per spec)

- [x] 🟩 **Step 2: Types — `lib/types/expense.ts` (+ call sites)**
  - [x] 🟩 **`Expense`**: `category: string | null`
  - [x] 🟩 **`ExpenseInsert`** (and any related insert/update types): `category?: string | null`
  - [x] 🟩 **`fetchActiveExpenses`** normalizes `category`; CSV imports set **`product_id` / `update_inventory` / `category`**

- [x] 🟩 **Step 3: Inventory — `app/inventory/page.tsx`**
  - [x] 🟩 **Add dialog**: mandatory **`ProductPicker`**; read-only product label; **`unit = 'pcs'`** on save; removed stub / unlinked **AlertDialog**
  - [x] 🟩 **Add**: “Units to Add” delta **> 0**; hint with current **0** for new product rows
  - [x] 🟩 **Add**: duplicate **`product_id`** → inline message + disabled Save
  - [x] 🟩 **Edit**: linked product **read-only**; legacy unlinked block; **Current Stock** absolute; **unit cost** / **reorder** editable
  - [x] 🟩 On save: **`sync_product_cost_from_expense`** when cost changed (edit) or on add (baseline null)

- [x] 🟩 **Step 4: Expenses form — `app/expenses/components/ExpenseForm.tsx`**
  - [x] 🟩 **`isStockPurchase`** state → **`update_inventory`**; top **`Switch`**; default **OFF** for new; **disabled when editing**
  - [x] 🟩 **OFF layout**: category, description, single amount, payment, vendor, notes
  - [x] 🟩 **ON layout**: product, qty, unit cost, live total, payment, vendor, notes
  - [x] 🟩 Stock path: **`sync_product_cost_from_expense`** after successful save
  - [x] 🟩 Validation per spec; optional vendor name only when no directory pick

- [x] 🟩 **Step 5: Expense list — `app/expenses/components/ExpenseList.tsx`** + mobile
  - [x] 🟩 **Category** column / detail row
  - [x] 🟩 **Stock** badge from **`update_inventory === true`**

- [x] 🟩 **Step 6: Verify**
  - [x] 🟩 `npx tsc --noEmit`

---

**Implementation note:** Read full current **`app/inventory/page.tsx`**, **`ExpenseForm.tsx`**, **`ExpenseList.tsx`**, and **`lib/types/expense.ts`** before editing; do not modify **`app/products/page.tsx`**, **`app/sales/`**, or triggers beyond this migration.
