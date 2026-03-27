# Business Manager — Product Requirements (Markdown)

**Sources:** `business-manager-PRD-v3.docx` (technical PRD v2.0, March 2026) · `business-manager-plain-english.docx` (non-technical overview).

**How to use with Cursor:** Reference a block by its **Section ID** (e.g. `prd.v2.4.2` or `exec.v2.M1`). Example prompt: *“Implement **exec.v2.M1**; follow **prd.v2.4.2** and **prd.v2.4.5**; respect **prd.design.7** and **prd.module-shipping**.”*

---

## `prd.module-shipping` — UI, UX, and design language (every module)

**Applies to all product modules** in this PRD (`prd.v1.3.*`, `prd.v2.4.*`, `prd.v3.5.*`, `exec.v2.*`, and any future execution blocks such as `exec.v3.*`).

1. **Full-stack delivery:** Each module ships **together**: **backend** (schema, migrations, RLS, RPCs or queries) **and** **functionality** **and** **UI** **and** **UX**. Do not merge “backend only” and defer screens to a later pass unless explicitly split in a written exception (default: **not allowed**).
2. **Design language:** All new surfaces **must match the existing app** — same **visual system** and interaction patterns as shipped modules (e.g. `AppChrome` / sidebar + mobile bottom nav, `PageHeader`, cards, shadcn-style `Dialog` / `Sheet` / `AlertDialog`, **Sonner** toasts, primary **#16a34a**, neutral canvas, `rounded-xl` controls, **₹** via `formatInrDisplay`, FAB rules where applicable). Reuse **existing components** before introducing one-offs; **`prd.design.7`** (mobile-first, 375px, 44px targets) is part of every acceptance criteria.
3. **Polish is in-scope:** Loading, empty, and error states, feedback on save/archive, and **internal navigation** via `next/link` — same bar as the rest of the product.

---

## Section index (quick reference)

| Section ID | Title |
|------------|--------|
| `prd.module-shipping` | **UI + UX + design alignment (every module)** |
| `prd.meta` | Document info & stack |
| `prd.1` | Product overview |
| `prd.2` | Users & access |
| `prd.v1` | Version 1 — Daily Recorder (full) |
| `prd.v1.3.1` | What’s in V1 |
| `prd.v1.3.2` | Product Repository (V1) |
| `prd.v1.3.3` | Sales Module (V1) |
| `prd.v1.3.4` | Expenses Module (V1) |
| `prd.v1.3.5` | Dashboard (V1) |
| `prd.v1.3.6` | V1 Data Model |
| `prd.v1.3.7` | V1 Mobile UX Rules |
| `prd.v2` | Version 2 — Full Ops (full) |
| `prd.v2.4.1` | What’s new in V2 |
| `prd.v2.4.2` | Vendor Module (V2) |
| `prd.v2.4.3` | Manual Inventory (V2) |
| `prd.v2.4.4` | Dashboard v2 additions |
| `prd.v2.4.5` | V2 Data Model — additions |
| `prd.v3` | Version 3 — Full Automation (full) |
| `prd.v3.5.1` — `prd.v3.5.7` | V3 features & data model |
| `prd.6` | Full data model (all versions) |
| `prd.design.7` | Mobile-first design |
| `prd.8` | Constraints & non-negotiables |
| `prd.9` | Out of scope |
| `prd.10` | Cursor / dev workflow |
| `prd.11` | Supabase free plan |
| `prd.12` | Scalability & V4 |
| `prd.13` | Commercial SaaS checklist |
| `prd.plain` | Plain-English summary (stakeholder) |
| **`exec.v2.M1`** | **V2 execution: Vendors (full stack)** |
| **`exec.v2.M2`** | **V2 execution: Manual inventory (full stack)** |
| **`exec.v2.M3`** | **V2 execution: Dashboard v2 (full stack)** |

---

## `prd.meta` — Document info

| Field | Value |
|--------|--------|
| Product | Business Manager |
| Author | Tapas |
| PRD file | v2.0 — full V1 / V2 / V3 scope with data model |
| Date | March 2026 |
| Status | Draft — development use |
| Stack | Next.js · Supabase · Vercel · Cursor AI |
| Primary device | Mobile (375px+); desktop secondary |
| Confidentiality | Confidential — for development use only |

All feature work must follow **`prd.module-shipping`** (UI + UX + design alignment with the existing app), in addition to **`prd.design.7`**.

---

## `prd.1` — Product overview

Business Manager is a **mobile-first, multi-tenant** SaaS app for small business owners to track **sales, expenses, inventory, customers, vendors**, and **live profitability** in one place.

- Built for **GreenOGreen** first; architected for **multiple businesses** under **separate logins**.
- Replaces manual **Google Sheets**; simple enough for **family members** on a phone.

**Three product versions** (each independently usable):

| Version | Theme | Core value |
|---------|--------|------------|
| **V1** — Daily Recorder | Sales, Expenses, Products, Dashboard | Replace your spreadsheet today |
| **V2** — Full Ops | Vendors, Manual Inventory | Complete operational picture |
| **V3** — Automation | Auto-inventory, Components, Import | Zero manual reconciliation |

**`*` Module delivery:** Each version is delivered through **modules** that include **backend, product behavior, UI, and UX** under a **single design language** (**`prd.module-shipping`**).

---

## `prd.2` — Users & access

| User type | Description |
|-----------|-------------|
| **Business Owner** | Primary user; full access; creates business account |
| **Family Member** | Shared login within same business; **equal access** in V1–V3 |

- **One login = one business**; no cross-business access.
- Isolation via **`business_id`** and **Supabase RLS**.
- **`*` Module delivery:** Any **auth/onboarding** change ships with matching **UI/UX** and the **same visual language** as login/shell today (**`prd.module-shipping`**).

---

## `prd.v1` — Version 1 — Daily Recorder

**Goal:** Record a sale in **under ~30 seconds** on the phone; see **today’s numbers** on the dashboard. Nothing more.

**`*` Module delivery (`prd.module-shipping`):** For **every** V1 module below, implement **Supabase + behavior + screen-level UI + UX** in step; **design language** must match the rest of the app.

### `prd.v1.3.1` — What’s in V1

| Module | What it does |
|--------|----------------|
| Product Repository | Master list: name, category, cost, MRP |
| Sales | Record sale — search product, price, cash/online |
| Expenses | Purchase — vendor (*free text*), item, qty, cost |
| Dashboard | Live totals: revenue, expenses, profit, cash in hand |
| Auth + Multi-tenant | Login, isolation, RLS |

**`*` Module delivery:** Each row is a **full vertical slice** (data layer, rules, **UI**, **UX**, **design alignment** per `prd.module-shipping`).

### `prd.v1.3.2` — Product Repository (V1)

**`*` Module delivery:** Catalogue **backend + list/form UI + UX** (dialogs, archive, toasts) ship together; **design language** consistent with Products and other modules.

- Master list; **cannot sell** unless product exists here.
- **Fields:** Name, Category (from list), MRP, Cost Price (COGS), HSN (optional), Tax % (optional).
- **V1:** no **components**; one product = one sellable item. Components in **V3**.

### `prd.v1.3.3` — Sales module (V1)

**`*` Module delivery:** **RPCs/save flow + Sales screens + inline profit/MRP UX** ship together; **UI** matches existing **Sales** patterns and `prd.design.7`.

- **Header:** date/time (auto, editable), customer name (**free text**), payment mode, totals, notes.
- **Lines:** product (search), qty, sale price; per-line **vs MRP** and **profit**; category tag from product.
- **Payment:** Cash or Online only.
- **Multi-line:** header shows total revenue, cost, profit.

### `prd.v1.3.4` — Expenses module (V1)

**`*` Module delivery:** **expenses table/RLS + list + form/dialog UX** together; same **design language** as Products/Sales (headers, FAB, `AlertDialog`, Sonner).

- Money out — purchase from any vendor.
- **V1:** **no inventory update** (V2+).
- **Fields:** date, vendor name (**free text**), item, qty, unit cost, total (= qty × unit cost), payment mode, notes.

### `prd.v1.3.5` — Dashboard (V1)

**`*` Module delivery:** **KPI RPCs + home UI** (cards, tables, loading/error) ship together; **visual style** aligned with **`KPICard`**, `PageHeader`, and app shell.

- **All-time** totals only — **no date filter** in V1 (filter is **V2**).

| KPI | Definition |
|-----|------------|
| Total Revenue | Sum of sale amounts |
| Total Expenses | Sum of expense amounts |
| Gross Profit | Revenue − Expenses |
| Cash in Hand | Sum of **cash** sales − sum of **cash** expenses |
| Online Received | Sum of **online** sales |

- No manual **opening balance** in V1 — derived from transactions only.

### `prd.v1.3.6` — V1 data model (authoritative list)

**`*` Module delivery:** Schema/RLS changes are **not done** without the **screens** that use them being updated in the same PR/train; **design language** for any new UI follows `prd.module-shipping`.

**Every table scoped by `business_id`.**

| Table | Key fields |
|-------|------------|
| businesses | id, name, owner_user_id, created_at |
| products | id, business_id, name, category, mrp, cost_price, hsn_code, tax_pct |
| sales | id, business_id, date, customer_name (text), payment_mode, total_amount, total_cost, total_profit, notes |
| sale_items | id, sale_id, product_id, quantity, sale_price, cost_price_snapshot, mrp_snapshot, vs_mrp, profit |
| expenses | id, business_id, date, vendor_name (text), item_description (text), quantity, unit_cost, total_amount, payment_mode, notes |

**Snapshots:** `sale_price`, `cost_price_snapshot`, `mrp_snapshot` stored **at sale time** — not recalculated when product changes later.

### `prd.v1.3.7` — V1 mobile UX rules

**`*` Module delivery:** These rules apply **while building each module’s UI** — not as a late pass; **layout and chrome** stay consistent with the **rest of the app**.

- Bottom nav: **Sales | Expenses | Products | Dashboard** (PRD order; align implementation with shipped shell).
- Record sale: search → qty → price → payment → save (**≤4 taps** target).
- Show profit / vs MRP **before save**.
- Tap targets **≥ 44px** height.
- Numeric keyboard for price/qty.
- **No horizontal scroll** at 375px.

---

## `prd.v2` — Version 2 — Full Ops

**Adds:** **Vendor** module (saved records + expense selector), **manual inventory**, **dashboard date range** + secondary breakdowns.

**`*` Module delivery (`prd.module-shipping`):** Each V2 capability below includes **backend + UI + UX** and **design language** aligned with V1-shipped surfaces.

### `prd.v2.4.1` — What’s new in V2

| Module | What it does |
|--------|----------------|
| Vendor Module | Saved vendors; selectable in expenses |
| Manual Inventory | Stock per item; manual adjust (receipts, breakage, gifts) |
| Dashboard v2 | Date range; KPIs by category, product, margins; cash vs online split |

**`*` Module delivery:** Each row is shipped as a **complete slice** (see **`exec.v2.*`**) including **screens and polish**, not schema-only.

### `prd.v2.4.2` — Vendor module (V2)

**`*` Module delivery:** **vendors data model + `/vendors` (or equivalent) UI + expense picker UX** together; **visual/UX** matches Products/Expenses (tables, dialogs, nav).

**Fields:** Name (required), Contact Person, Phone, Address, Notes (optional).

- Expense form: **vendor selector** + **free-text fallback** for unknown / one-off vendors.
- **Important:** Free-text vendor on expense **does not** auto-create a vendor row.

### `prd.v2.4.3` — Manual inventory (V2)

**`*` Module delivery:** **inventory_items + list/detail/adjust UI + feedback** shipped with backend; **design language** matches app shell, cards, and form patterns.

**Inventory items** = physical shelf stock (components and standalone SKUs).

| Field | Details |
|-------|---------|
| Name | e.g. Plant Gifting Cover, Pot, Microgreen Seeds 50g |
| Unit | pcs / kg / litre / packet / etc. |
| Current Stock | On hand; **manually** set/adjusted |
| Unit Cost | Per unit — used for **inventory value** in V3 |
| Reorder Level | Optional; low-stock signal |

- **V2:** manual updates only. **Auto-deduction on sale = V3.**

### `prd.v2.4.4` — Dashboard v2 additions

**`*` Module delivery:** **Date-range RPCs/queries + dashboard UI controls** (e.g. bottom sheet / pickers) and **chart/table presentation** ship with the same increment; styling consistent with existing dashboard **`KPICard`** / **`PageHeader`** patterns.

Keep all **V1 KPIs**. Add:

- Custom **date range** (from–to); all KPIs respect range.
- **Sales by category** — revenue by category.
- **Sales by product** — top by volume and by revenue.
- **Margin by product** — profit % per product.
- **Cash vs online** split / breakdown.

### `prd.v2.4.5` — V2 data model — additions

**`*` Module delivery:** Apply **expenses/vendor_id** and new tables only **with** the **UI** that exercises them (picker, inventory screens); **design alignment** per `prd.module-shipping`.

| Table / change | Details |
|----------------|---------|
| **vendors** (new) | id, business_id, name, contact_person, phone, address, notes |
| **inventory_items** (new) | id, business_id, name, unit, current_stock, unit_cost, reorder_level |
| **expenses** (update) | **vendor_id** nullable FK → vendors; **vendor_name** text **retained** as fallback |

**Rule:** `vendor_id` set when user picks saved vendor; **null** + `vendor_name` filled when user types free text. **Both coexist permanently.**

---

## V2 delivery — full-stack modules (`exec.v2.*`)

Ship **one execution module at a time**. Each module is **complete**: migrations, RLS, APIs/RPCs, queries, **full UI**, **full UX** (loading/empty/error, toasts, confirmations), **`prd.module-shipping`** (design language match), mobile rules in **`prd.design.7`**, QA.

| Execution ID | Scope (do all together) | PRD sections to load |
|----------------|-------------------------|----------------------|
| **`exec.v2.M1`** | **Vendors:** `vendors` table, RLS, **CRUD UI** (same look/feel as Products), archive pattern, **expenses** form: picker + free text, nullable FK + fallback text — **no missing screens** | `prd.module-shipping`, `prd.v2.4.2`, `prd.v2.4.5`, `prd.design.7`, `prd.8`, `prd.v1.3.4` |
| **`exec.v2.M2`** | **Manual inventory:** `inventory_items` table, RLS, **list + manual adjust UI**, optional low-stock hint, Sonner/AlertDialog patterns; **no** auto sale deduction | `prd.module-shipping`, `prd.v2.4.3`, `prd.v2.4.5`, `prd.design.7`, `prd.8` |
| **`exec.v2.M3`** | **Dashboard v2:** date range, RPCs/queries for filtered KPIs + breakdowns per **`prd.v2.4.4`**; **all controls and visuals** consistent with current dashboard | `prd.module-shipping`, `prd.v2.4.4`, `prd.v1.3.5`, `prd.design.7`, `prd.8` |

**Suggested order:** **M1 → M2 → M3** (vendors before dashboard splits that might reference vendor dimensions later; inventory before any V3 bridge).

**Implementation note:** The current codebase may use table names like `inventory` / `products` joins — align migrations with **`prd.6`** and `prd.v2.4.5` naming (**inventory_items**, **vendors**) or document a deliberate mapping in the module ticket.

---

## `prd.v3` — Version 3 — Full Automation

**Theme:** Link products to physical components; **auto stock deduction** on sale save; **inventory value** on dashboard; **CSV import**; **customers** module.

**`*` Module delivery (`prd.module-shipping`):** Every V3 feature below ships **backend + UI + UX** together; **design language** remains aligned with V1–V2 surfaces (no alternate visual system without explicit redesign decision).

### `prd.v3.5.1` — What’s new in V3

**`*` Module delivery:** Each feature row below includes **user-facing flows** polished to the same standard as existing modules.

| Feature | What it does |
|---------|----------------|
| Product Components | Link inventory items to products with qty per unit sold |
| Auto inventory deduction | On **save sale**, deduct per component |
| Customer module | Saved customers + purchase history |
| Inventory value KPI Σ (stock × unit cost) | Dashboard |
| Data import | CSV templates; Settings → Import |

### `prd.v3.5.2` — Product components (V3)

**`*` Module delivery:** **Schema/product_components + product edit UI** (link components step) + validation feedback; **UX** and **styling** match Products module patterns.

- Example: Product “Plant Gifting” = **1× Cover + 1× Pot** (inventory items).
- Qty sold scales component deduction linearly.
- **UI:** product must have **≥1 component** before sale (enforced in UI per PRD).

### `prd.v3.5.3` — Auto inventory deduction (V3)

**`*` Module delivery:** **Deduction logic + sale save path + user-visible warnings/toasts** shipped together; **Sales** screen behavior and copy consistent with current design.

- Runs at **sale save**, not draft/cart.
- For each line: look up **product_components**; reduce **inventory_items.current_stock** by **quantity_per_unit × line qty**.
- If stock would go **below zero**: **warn** but **allow** sale (reality may differ from books); manual correction remains.

### `prd.v3.5.4` — Customer module (V3)

**`*` Module delivery:** **customers table + CRUD/list + sale customer picker + history view** with same **UI kit** as Vendors/Products; **design language** per `prd.module-shipping`.

**Fields:** Name, Phone, Address (optional), purchase history (sales linked).

- **sales.customer_id** nullable FK; **customer_name** free text kept for legacy rows.

### `prd.v3.5.5` — Inventory value KPI (V3)

**`*` Module delivery:** **KPI query/RPC + dashboard presentation** (cards, labels, help text) aligned with existing **`KPICard`** styling.

**Inventory value** = **Σ (current_stock × unit_cost)** over inventory items (calculated at query time, not stored).

### `prd.v3.5.6` — Data import (V3)

**`*` Module delivery:** **Import pipeline + Settings UI** (upload, preview, errors, success) using same **cards, buttons, and feedback** patterns as existing Settings exports.

- Per-module **CSV templates** + example row; Settings **Import Data**; validate + preview; row-level errors.
- **Import order:** Products → Inventory Items → Customers & Vendors → Sales & Expenses history.
- Historical sales import **does not** run inventory deduction; stock set via inventory import.

**Template columns (PRD):**

| Template | Columns |
|----------|---------|
| Products | name, category, mrp, cost_price, hsn_code, tax_pct |
| Inventory Items | name, unit, current_stock, unit_cost, reorder_level |
| Customers | name, phone, address |
| Vendors | name, contact_person, phone, address |
| Sales History | date, customer_name, product_name, quantity, sale_price, payment_mode, notes |
| Expenses History | date, vendor_name, item_name, quantity, unit_cost, payment_mode, notes |

### `prd.v3.5.7` — V3 data model — additions

**`*` Module delivery:** Schema changes land with the **screens or imports** that use them; **no orphan tables** without matching **UI/UX** per `prd.module-shipping`.

| Table / change | Details |
|----------------|---------|
| **product_components** (new) | id, product_id, inventory_item_id, quantity_per_unit |
| **customers** (new) | id, business_id, name, phone, address |
| **sales** (update) | customer_id nullable FK; customer_name retained |
| **imports_log** (new) | id, business_id, module, filename, imported_at, rows_success, rows_failed |

---

## `prd.6` — Full data model — all versions

**Principle:** Schema grows **additively**. V1 not broken by V2/V3; new columns **nullable**; new tables additive.

**`*` Module shipping:** Data model sections support **product modules**; any new table/column is introduced in the **same delivery** as the **functionality + UI + UX** that exposes it (**`prd.module-shipping`**).

### `prd.6.1` — Complete table list

| Table | Purpose | Introduced |
|-------|---------|------------|
| businesses | One row per business | V1 |
| products | Catalogue | V1 |
| sales | Sale header | V1 |
| sale_items | Lines | V1 |
| expenses | Purchases | V1 |
| vendors | Saved vendors | V2 |
| inventory_items | Physical stock | V2 |
| product_components | Product ↔ inventory qty | V3 |
| customers | Saved customers | V3 |
| imports_log | Import audit | V3 |

### `prd.6.2` — Key relationships

- sale_items.sale_id → sales  
- sale_items.product_id → products  
- product_components.product_id → products; product_components.inventory_item_id → inventory_items  
- expenses.vendor_id → vendors (nullable)  
- sales.customer_id → customers (nullable)  
- All tenant tables: **business_id** → businesses (**RLS**)

### `prd.6.3` — Critical design decisions

- Transaction **snapshots** at sale time; never rewrite history from current product.
- **vendor_id** and **customer_id** always nullable; **free-text fallbacks permanent**.
- **V3** deduction only on **committed sale**, not draft.
- **Inventory value** is computed, not stored.
- **Every table** has **business_id**; RLS before other logic.

---

## `prd.design.7` — Mobile-first design requirements

**Relationship to modules:** **`prd.design.7`** is the **interaction and layout** half of **`prd.module-shipping`**; every module’s implementation must satisfy both so **UI/UX stays coherent app-wide**.

### `prd.design.7.1` — Core rules (every screen)

- One-thumb use at **375px**; targets **≥ 44px** height.
- No horizontal scroll at ≥375px.
- Numeric keyboard for price, qty, phone.
- **Bottom nav** for primary actions on mobile (not sidebar-only).
- Prefer **modals / bottom sheets** for quick entry.

### `prd.design.7.2` — Breakpoints

| Breakpoint | Layout |
|------------|--------|
| &lt; 640px | Single column, bottom nav, stacked KPIs |
| 640–1024px | Two-column forms, optional side nav |
| &gt; 1024px | Sidebar, multi-column tables, expanded dashboard |

### `prd.design.7.3` — Critical flows

| Flow | Requirement |
|------|----------------|
| Record sale | Search → qty → price → profit visible → payment → save (**≤4 taps** target) |
| Record expense | Vendor dropdown + free text → item → qty → cost → payment → save |
| Dashboard | Stacked KPIs; charts scroll; date picker as bottom sheet (V2+) |
| Add product | Step form; component linking separate step (V3) |
| Check inventory | Stock prominent; inline adjust (V2) |

---

## `prd.8` — Constraints & non-negotiable rules

- **Every module:** **Backend + functionality + UI + UX** ship together; **design language** matches the rest of the app (**`prd.module-shipping`**).
- Every table **`business_id`**.
- **RLS live** before writes — not “added later”.
- Sale **snapshots** immutable vs current product.
- **V3** deduction on save only; not cart.
- **Free-text fallbacks** for vendor/customer **never removed**.
- **Additive migrations** only for V2/V3.
- **Cursor** as primary dev tool; **migrations + deploy manual** per team process.

---

## `prd.9` — Out of scope (V1–V3)

| Item | Note |
|------|------|
| GST filing / invoice gen | Separate product |
| Role-based access | V4+; family **equal** in V1–V3 |
| Native app stores | Mobile web; PWA post-V3 |
| Razorpay / live payments | Online = manual entry |
| Opening stock carry-forward | Import / manual V2/V3 |
| Barcode | V4 |
| Multi-currency | INR only |

---

## `prd.10` — Cursor AI development workflow

This markdown is the **single source of truth** for scoped work. Feed **section IDs** before each module. **Always include `prd.module-shipping` + `prd.design.7`** when scoping a module so **UI/UX and visual consistency** are explicit.

| Command / step | When |
|----------------|------|
| Explore | Map scope to **prd.* / exec.*** sections |
| Plan | Schema, APIs, **UI components**, **UX states**, **`prd.module-shipping`** checklist |
| Execute | Implement **full stack** (data + behavior + screens + polish) |
| **Manual** | Apply Supabase migrations; git push / Vercel |
| Review | RLS, `business_id`, logic |
| Document | Changelog |

**Rule:** Auth + RLS before feature code; **`business_id` without RLS = data leak risk.**

---

## `prd.11` — Supabase free plan (summary)

- Limits: **2 projects**, **500 MB** DB, egress caps, **7-day** backups, **inactivity pause** (~7 days no traffic).
- **Mitigations:** cron ping (~5 days), weekly manual export, Discord/issues for support.
- **Upgrade triggers:** paying external tenants, ~400 MB storage, uptime/backup needs.

---

## `prd.12` — Scalability & V4 direction

- **V4 (commercial) examples:** self-serve signup, Razorpay billing, RBAC, admin panel, onboarding, Supabase Pro, built-in keep-alive route.

---

## `prd.13` — Commercial SaaS checklist (from PRD)

Use the Word checklist for **Done / In progress**; keep engineering status in `CHANGELOG` or project board. Items include: `business_id`, RLS, soft delete, indexes, cron ping, backups, pagination (V2), leakage tests, etc.

---

## `prd.plain` — Plain-English summary *(from `business-manager-plain-english.docx`)*

**Problem:** GreenOGreen runs on **Google Sheets** — slow, error-prone, hard on mobile at the stall.

**What the app does (simple):**

1. Remembers **products** (name, cost, usual sell price).  
2. Every **sale**: what sold, price, cash/online → **instant profit** vs cost and vs MRP.  
3. Every **expense**: what bought, from whom, how much.  
4. **Live dashboard**: revenue, expenses, profit, cash in hand.  
5. Later: **physical inventory**; V3 automates tying sales to stock.

**Three versions (why staged):**

- **V1:** Use **this week** — sales, expenses, products, dashboard.  
- **V2:** **Vendor list**, **manual inventory**, **dashboard date ranges**.  
- **V3:** **Components**, **auto stock deduction**, **inventory value** on dashboard, **Sheets import**.

**Also:** Multiple businesses = **separate logins**, no data crossover. **Mobile first**; not GST invoicing, not Play Store native app, not payment-gateway connected (manual “online” recording).

---

## Change log (markdown PRD)

| Date | Change |
|------|--------|
| 2026-03 | Created `docs/PRD.md` from attached `.docx` sources; added **Section IDs** + **`exec.v2.M1–M3`** delivery map. |
| 2026-03 | Added **`prd.module-shipping`**; **UI + UX + design-language alignment** called out in **every module** + **`prd.8`** / **`prd.10`**. |

---

*End of markdown PRD.*
