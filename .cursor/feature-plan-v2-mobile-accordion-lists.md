# Feature Implementation Plan — Mobile accordion lists (Products, Expenses, Inventory, Vendors)

**Overall Progress:** `100%`

## TLDR

Extend **`prd.v2.mobile-polish`**-style **accordion rows** to **Products**, **Expenses**, **Inventory**, and **Vendors** list screens. Below **`md`**, each module shows a **compact summary row** (no horizontal table scroll); **tap expands** **`bg-muted/40`** detail. **`md+`** keeps existing **`<Table>`**. Slightly **smaller typography/padding** on mobile.

## Exploration summary (codebase)

| Module | Current UI | File(s) |
|--------|------------|---------|
| **Products** | Wide table: name, category, variant, MRP, cost, margin, actions | `app/products/page.tsx` (`getMargin` local, `filteredProducts`) |
| **Expenses** | `ExpenseList` table: date+time, vendor, item, units, amount, payment, actions | `app/expenses/components/ExpenseList.tsx` |
| **Inventory** | Table: name, unit, on hand, unit cost, value, reorder, product link, actions | `app/inventory/page.tsx` (`filtered`, `isLowStock`, `products` for link label) |
| **Vendors** | Table: name, phone, contact, address, email, archive | `app/vendors/page.tsx` |

**Sales** already has **`SalesMobileList`** — reuse same **grid `grid-template-rows` + `motion-reduce`** pattern.

## Critical Decisions

- **Decision 1: Breakpoint `md`** — Match Sales / shell (`md:hidden` mobile list, `hidden md:block` table).
- **Decision 2: Single open row per list** — Consistent with **`SalesMobileList`** (`openId` state per screen).
- **Decision 3: Actions on summary row** — Edit / archive (or link+archive for vendors) stay **visible** on collapsed row so users need not expand to act.
- **Decision 4: Expense date** — Collapsed uses **date only** (`en-IN` medium date, **no time**); desktop table can keep short datetime or align to date-only for consistency → **mobile only** date-only per spec.
- **Decision 5: Vendors visible columns** — User asked **name, contact, address** visible; **phone + email** in expand. **Archive** stays on summary row.
- **Decision 6: Inventory visible** — **Name, on hand, unit cost, line value** (qty × unit cost); **unit, reorder, linked product** (and low-stock is row tint) in expand — user said “value” in summary; **unit** in collapsible.
- **Decision 7: Shared primitives** — Small **`components/mobile/`** helpers (`MobileAccordionBody`, chevron) to avoid four copies of transition markup.

## Tasks

- [x] 🟩 **Step 1: Shared mobile accordion primitives**
  - [x] 🟩 `components/mobile/MobileAccordion.tsx` — chevron + expand region (grid rows + `motion-reduce`).

- [x] 🟩 **Step 2: Products**
  - [x] 🟩 `app/products/components/ProductsMobileList.tsx` — summary: name, category badge, variant; expand: MRP, cost, margin (reuse margin tone); actions on row.
  - [x] 🟩 `app/products/page.tsx` — `md:hidden` / `hidden md:block` split.

- [x] 🟩 **Step 3: Expenses**
  - [x] 🟩 `app/expenses/components/ExpenseMobileList.tsx` — summary: date (no time), item, units, amount; expand: vendor, payment badge; actions on row.
  - [x] 🟩 `ExpenseList.tsx` or `expenses/page.tsx` — wire mobile + desktop (keep refresh header).

- [x] 🟩 **Step 4: Inventory**
  - [x] 🟩 `app/inventory/components/InventoryMobileList.tsx` — summary: name, on hand, unit cost, value; expand: unit, reorder, linked product; low-stock row class; actions on row.
  - [x] 🟩 `inventory/page.tsx` — split table / mobile list; optional compact KPI cards (`text-lg md:text-2xl`).

- [x] 🟩 **Step 5: Vendors**
  - [x] 🟩 `app/vendors/components/VendorsMobileList.tsx` — summary: name (link), contact, address; expand: phone, email; archive on row.
  - [x] 🟩 `vendors/page.tsx` — split.

- [x] 🟩 **Step 6: Verify**
  - [x] 🟩 `npx tsc --noEmit`
  - [x] 🟩 Update this plan **Overall Progress** to **`100%`** and mark steps 🟩.
