# Feature Implementation Plan — `prd.v2.mobile-polish`

**Overall Progress:** `100%`

## TLDR

Deliver **mobile polish** under **`prd.v2.mobile-polish`**: (1) **primary navigation** without a bottom tab bar — **menu FAB** + **left slide-over** with the same destinations as the desktop sidebar; (2) **Sales list** on small screens as **accordion rows** instead of a horizontally scrolling table. **Shipped.**

## Critical Decisions

- **Decision 1: Slide-over from the left** — Matches “sidebar” mental model; **Sheet** `side="left"`, not a persistent narrow rail on 375px.
- **Decision 2: Menu FAB bottom-right, toggle open/close** — Same visual language as module FABs; **`z-[60]`** so the control stays usable above the sheet overlay; **X** when open, **Menu** when closed.
- **Decision 3: Remove `MobileBottomNav`** — Single primary nav pattern on mobile; **`MAIN_NAV_ITEMS`** + logout/user duplicated from desktop sidebar content.
- **Decision 4: Stack module FABs above menu FAB** — **`globals.css`** tokens **`--menu-fab-bottom-mobile`**, **`--page-fab-bottom-mobile`**, **`--main-bottom-mobile`** so Products / Expenses / Sales FABs and scroll padding stay coherent.
- **Decision 5: Docs live in PRD under `prd.v2.mobile-polish`** — **`prd.design.7`** breakpoint copy updated so it does not mandate a bottom tab bar.
- **Decision 6 (Sales accordion):** **Single open row** at a time (`openSaleId`). Accordion **below `md`** only; **`fetchSalesList`** extended with **`lines`** + **`total_profit` / `total_cost`** for expanded body.

## Tasks

- [x] 🟩 **Step 1: Mobile shell — navigation**
  - [x] 🟩 Remove **`MobileBottomNav`**; delete component file; drop **`--mobile-nav-height`** usage.
  - [x] 🟩 **`AppShell`**: controlled **`Sheet`** from left; **`ShellNavLinks`** shared pattern with desktop **`aside`** (same **`MAIN_NAV_ITEMS`**).
  - [x] 🟩 Menu FAB **`md:hidden`**: toggle sheet; **`aria-expanded`** / **`aria-controls`**; sign-out closes sheet then hard **`/login`**.
  - [x] 🟩 **`lib/nav.ts`** comment: single source for desktop + mobile sheet.

- [x] 🟩 **Step 2: FAB stacking & layout tokens**
  - [x] 🟩 **`globals.css`**: **`--menu-fab-bottom-mobile`**, **`--page-fab-bottom-mobile`**, **`--main-bottom-mobile`** (two-FAB clearance).
  - [x] 🟩 **`Fab`**: **`bottom-[var(--page-fab-bottom-mobile)]`** on small screens; **`md:bottom-6`** unchanged.

- [x] 🟩 **Step 3: Product docs**
  - [x] 🟩 **`docs/PRD.md`**: **`prd.v2.mobile-polish`** — “Mobile shell” subsection; **`prd.design.7`** + index row + module-shipping line aligned.
  - [x] 🟩 **`CHANGELOG.md`**, **`docs/knowledgebase.md`**: nav / FAB / Unreleased notes.

- [x] 🟩 **Step 4: Sales list — mobile accordion (`prd.v2.mobile-polish` § Sales table)**
  - [x] 🟩 Below **`md`**: **`SalesMobileList`** — collapsed summary (order id, customer, ₹ total, payment **`Badge`**, chevron).
  - [x] 🟩 Expanded: date, optional phone/address/type, **sale profit**, per-line blocks (name/variant, category, qty, sale price, cost, MRP, vs MRP, line profit); **`md+`**: existing **`<Table>`** unchanged.
  - [x] 🟩 **`min-h-14`** row tap target; **`bg-muted/40`** inset; profit **`text-finance-*`**; grid **`transition-[grid-template-rows]`** + **`motion-reduce:transition-none`**.

- [x] 🟩 **Step 5: Verify**
  - [x] 🟩 **`npx tsc --noEmit`** passes.
  - [x] 🟩 **Manual:** spot-check at **375px** — menu FAB + sheet; Sales accordion + FAB stack (recommended on device / DevTools).
