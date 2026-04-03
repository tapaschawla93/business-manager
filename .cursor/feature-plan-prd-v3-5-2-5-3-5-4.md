# Feature Implementation Plan — `prd.v3.5.2`, `prd.v3.5.3`, `prd.v3.5.4`

**Overall Progress:** `100%` *(code complete — smoke-test Sales new/edit + BOM + customer pick)*

## TLDR

Shipped **Sales** UX for V3: **BOM visibility** per line, **warnings** for no-BOM products and projected **component shortfalls**, and a **saved-customer combobox** (`CustomerPicker`). **Did not** allow negative `inventory_items.current_stock` in DB (CHECK + ledger sync would break); **did not** add `p_customer_id` RPC (picker fills fields; `save_sale` still links by phone).

## Critical Decisions (as executed)

- **5.2:** **Warn + educate**, not hard-block sales without `product_components` — keeps **ledger-only** SKUs working (matches migration “no rows → no deduction”).
- **5.3:** **Client warnings only**; server **unchanged** (insufficient component stock still raises). Rationale: `inventory_items.current_stock >= 0` CHECK + **`inventory_items_push_to_ledger`** → **`inventory.quantity_on_hand >= 0`**.
- **5.4:** **UI-only picker**; **`save_sale` / `update_sale`** signatures unchanged.

## Tasks

- [x] 🟩 **Step 1: `prd.v3.5.2` — Component gate on Sales**
  - [x] 🟩 `fetchProductComponentCounts` + `useEffect` on line product IDs; **`ProductLineRow`** BOM / no-BOM copy.

- [x] 🟩 **Step 2: `prd.v3.5.3` — Deduction behavior + warnings**
  - [x] 🟩 `fetchComponentShortfallsForLines` + pre-submit **`toast.warning`** (RPC block retained).

- [x] 🟩 **Step 3: `prd.v3.5.4` — Sale customer picker**
  - [x] 🟩 **`CustomerPicker`** + **`SalesForm`** wiring (load `customers`, pick / clear).

- [x] 🟩 **Step 4: Verify**
  - [x] 🟩 `npx tsc --noEmit`
  - [ ] 🟨 Manual: new sale + edit; BOM lines; customer pick; shortfall path.

- [x] 🟩 **Step 5: Document**
  - [x] 🟩 **`CHANGELOG.md`**, **`docs/knowledgebase.md`** note on component CHECK vs PRD.

---

## Status emoji key

- 🟩 Done  
- 🟨 In Progress  
- 🟥 To Do  
