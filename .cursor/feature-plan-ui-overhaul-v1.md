# Feature Implementation Plan — UI Overhaul (V1)

**Overall Progress:** `100%`

## TLDR

Reskin the app to a clean SaaS look (grey canvas, white cards/sidebar, **#16a34a** primary) using **shadcn/ui** + **Sonner**, **lucide-react** icons, and a **desktop sidebar + mobile bottom nav** shell. **No new Supabase `.from()` / `.rpc()` calls** and **no RPC/schema changes**—only existing data flows. **Sales** stays the current **New Sale** flow only (no list, no export on that page).

## Critical Decisions

- **Data boundary:** Strict—no new client queries or RPCs; UI consumes only what pages/components already load today.
- **Sales scope:** Reskin existing `SalesForm` / page only; no Sales Records table, no Export CSV on `/sales`.
- **Dashboard top products:** If category is not in the current payload, **omit the column** (no placeholder column or fake labels).
- **Business name on dashboard:** No extra read; use name only if already available in existing state/props; else subtitle fallback **“Your business”**.
- **Sidebar role:** Static **“Owner”**; no new profile fields.
- **Products margin %:** Compute in UI: **`(mrp - cost_price) / cost_price`**; hide or show **—** when `cost_price <= 0` (no division by zero).
- **Login:** Minimal centered card; **no** full SaaS shell (no sidebar / bottom nav).
- **Confirmations:** Replace **`window.confirm`** with **AlertDialog**; use **Sonner** for transient success/error (no `alert()` today).
- **FAB:** Custom fixed **Button** (`rounded-full`, primary); position above **64px** mobile bottom nav.
- **Combobox:** **Command** + **Popover** for product search in sales form **without** changing fetch logic (still same product source as today).

## Tasks

- [x] 🟩 **Step 1: Tooling — shadcn + Sonner + tokens**
  - [x] 🟩 Manual shadcn-equivalent: `components/ui/*`, `lib/utils.ts`, `components.json`, `tailwindcss-animate`, Radix primitives, **Sonner**, **cmdk**
  - [x] 🟩 **`--primary`** → **#16a34a** in `globals.css`; page background **~#f4f4f5**
  - [x] 🟩 **Toaster** in `AppChrome` (all routes)

- [x] 🟩 **Step 2: shadcn components**
  - [x] 🟩 button, card, input, textarea, select (skipped unused), badge, table, dialog, sheet, label, separator, sonner, command, popover, alert-dialog

- [x] 🟩 **Step 3: App shell (authed routes)**
  - [x] 🟩 **Sidebar (desktop 240px):** BizManager logo, nav pills, red Logout, avatar + email + Owner
  - [x] 🟩 **Main:** grey background, `md:pl-[240px]`, bottom padding for mobile nav
  - [x] 🟩 **Mobile bottom nav (64px)** — 5 icons + labels
  - [x] 🟩 **FAB** — `components/Fab.tsx` (Products, Expenses; not Sales)

- [x] 🟩 **Step 4: Global UX patterns**
  - [x] 🟩 **AlertDialog** archive on products + expenses
  - [x] 🟩 **Sonner** on save/archive/export and key errors
  - [x] 🟩 Inputs **~10px** radius, primary full-width CTAs

- [x] 🟩 **Step 5: Dashboard (`app/page.tsx`)**
  - [x] 🟩 Title + **Your business** subtitle (no new query)
  - [x] 🟩 KPI grid **5 + 2**; revenue/profit green, expenses red
  - [x] 🟩 Top products **Table** with **#** column; no category column

- [x] 🟩 **Step 6: Products**
  - [x] 🟩 Dialog form, table, FAB, margin %, icon actions

- [x] 🟩 **Step 7: Sales**
  - [x] 🟩 Reskin + **Popover + Command** product picker; same RPC/state

- [x] 🟩 **Step 8: Expenses**
  - [x] 🟩 Dialog form, table, FAB, AlertDialog

- [x] 🟩 **Step 9: Settings**
  - [x] 🟩 Card + export buttons + download icons + toast

- [x] 🟩 **Step 10: Login**
  - [x] 🟩 Centered card, shadcn inputs; no shell

- [ ] 🟨 **Step 11: QA**
  - [ ] 🟥 Manual: 375px, dialogs, FAB vs nav, regression on all flows
