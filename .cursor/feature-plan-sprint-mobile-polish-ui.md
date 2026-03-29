# Feature Implementation Plan — Sprint: Mobile Polish (UI-only)

**Overall Progress:** `100%`

## TLDR

Shipped: smaller **primary buttons** on module pages, **Sales** collapsed/expanded accordion content, **Expense** row **kebab** menu, **tighter horizontal padding** on several mobile lists, and **kebab parity** on **Products, Inventory, Vendors, Sales** with **Edit** + **Archive/Delete** plus **Sales edit/update** and **sale archive** / **inventory line delete** RPCs.

## Critical Decisions

- **Decision 1: Mobile-only sizing via breakpoints** — Use Tailwind patterns already used on the dashboard (`h-10` / `text-sm` default, `md:h-11` / `md:text-base` restore) for header CTAs, empty-state buttons, and dialog submits on the five pages + `ExpenseForm`, so desktop is unchanged.
- **Decision 2: No shared “collapsed row” refactor** — Collapsed content lives **per file** (`*MobileList.tsx` + custom `SalesMobileList`); adjust each target file directly rather than introducing a new abstraction for this sprint.
- **Decision 3: Expense row actions → kebab** — Add **shadcn `DropdownMenu`** (`components/ui/dropdown-menu.tsx`); there is no existing dropdown in the app today. Replace visible Pencil/Trash column in `ExpenseMobileList` with a single trigger + menu items (edit, archive/delete per current behavior).
- **Decision 4: Padding scope** — Reduce outer/inner horizontal padding only for **Products, Sales, Expenses** mobile list wrappers as specified; optional parity on Inventory/Vendors only if product owner wants alignment (out of explicit scope).
- **Decision 5: Kebab parity** — Reuse **`DropdownMenu`** (same pattern as **`ExpenseMobileList`**): one icon column, **Edit** + **Archive/Delete** items; remove duplicate icon strips so every module’s mobile row affordance feels the same.
- **Decision 6: Sales row actions** — **`archive_sale`** + **`update_sale`** (SECURITY DEFINER) mirror **`save_sale`** inventory rules; **`delete_inventory_item`** returns linked on-hand qty to the ledger before deleting the row.

## Tasks

- [x] 🟩 **Step 1: FIX 1 — Primary buttons smaller on mobile (five pages)**
  - [x] 🟩 **Products** (`app/products/page.tsx`): header toolbar buttons, mobile-only CTAs, dialog submit — mobile height + font; `md:` restores current desktop.
  - [x] 🟩 **Sales** (`app/sales/page.tsx`): header row + mobile empty-state CTA — same pattern.
  - [x] 🟩 **Expenses** (`app/expenses/page.tsx` + `ExpenseForm.tsx`): header row + form submit (`h-12` / `text-base` → responsive).
  - [x] 🟩 **Inventory** (`app/inventory/page.tsx`): header row + dialog Save (`size="full"` overrides).
  - [x] 🟩 **Vendors** (`app/vendors/page.tsx`): header row + dialog submit (`size="full"` overrides).

- [x] 🟩 **Step 2: FIX 2 — Sales accordion collapsed row (mobile only)**
  - [x] 🟩 **`SalesMobileList.tsx`**: collapsed `button` shows **customer name**, **total amount**, **payment badge** (Cash / Online) + chevron only.
  - [x] 🟩 Move **order label (ORD-…)**, **date**, **products and quantities**, **cost / profit / vs MRP** (and any sale-level summary that belongs with those) into the **expanded** panel; keep `md+` table unchanged.

- [x] 🟩 **Step 3: FIX 3 — Expense accordion row actions under kebab**
  - [x] 🟩 Add **`components/ui/dropdown-menu.tsx`** (Radix/shadcn pattern, match existing `button` / `popover` style).
  - [x] 🟩 **`ExpenseMobileList.tsx`**: remove inline edit/archive icon column; add kebab trigger; menu items call existing `onEdit` / archive handlers; `stopPropagation` where needed so row expand still works.

- [x] 🟩 **Step 4: FIX 4 — Wider mobile rows (Products, Sales, Expenses)**
  - [x] 🟩 **`ProductsMobileList.tsx`**: reduce list wrapper and/or row horizontal padding (`px-*`) so content uses more width below `md`.
  - [x] 🟩 **`SalesMobileList.tsx`**: same for sales list container / row padding.
  - [x] 🟩 **`ExpenseMobileList.tsx`**: same for expense list container / row padding.

- [x] 🟩 **Step 5: Verify**
  - [x] 🟩 `npx tsc --noEmit` passes.
  - [x] 🟩 Manual spot-check at ~375px: five pages’ primary actions; Sales/Expense/Product rows; desktop breakpoints unchanged for tables and full-size buttons.

- [x] 🟩 **Step 6: Row kebab — Products, Inventory, Vendors, Sales (match Expenses)**
  - [x] 🟩 **Products** (`ProductsMobileList.tsx`): replace the **Edit / Archive** icon column with a **kebab**; menu items **Edit** and **Archive** calling the same `onEdit` / `onArchive` props as today.
  - [x] 🟩 **Inventory** (`InventoryMobileList.tsx`): **kebab** with **Edit** and **Delete line** (parent **AlertDialog** + **`delete_inventory_item`** RPC).
  - [x] 🟩 **Vendors** (`VendorsMobileList.tsx`): **kebab** with **Edit** (navigate to `/vendors/[id]`) and **Archive** (same as before).
  - [x] 🟩 **Sales** (`SalesMobileList.tsx` + **`SalesForm`** + **`/sales`**): **kebab** with **Edit** (dialog + **`update_sale`**) and **Archive** (**`archive_sale`** + confirm).
  - [x] 🟩 **Regression pass**: below `md`, row expand still toggles from the main row; kebab does not collapse/expand the accordion; desktop tables unchanged.

### Follow-up (shipped in repo)

- [x] 🟩 **Inventory delete:** client path (**`inventory_apply_delta_for_tenant`** + **`inventory_items` delete**) so delete works without **`delete_inventory_item`** on the server.
- [x] 🟩 **Sales missing RPC:** **`saleRpcUserHint`** points at migration **`20260401160000_...`**; **`archive_sale`** / **`update_sale`** still require that SQL on Supabase.
- [x] 🟩 **Vendors / Expenses mobile kebab:** **Archive** only; vendor **name** link → detail; **Expenses** desktop **Edit** unchanged.
- [x] 🟩 **Expenses ↔ inventory:** **`expenses_sync_inventory`** **UPDATE** branch no-op (**`20260401170000_expenses_sync_inventory_update_noop.sql`**) — archive/edit do not move stock; **INSERT** stock purchases unchanged (app applies delta after insert).
