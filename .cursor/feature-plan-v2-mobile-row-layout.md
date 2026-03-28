# Feature Implementation Plan — Mobile row summary layout (Vendors, Inventory, Products)

**Overall Progress:** `100%`

## TLDR

**Collapsed** mobile rows use a **compact horizontal summary** with **up to two lines** of wrap (not strict single-line truncation). **Vendors:** name (link), contact, address on the summary; phone/email stay in the accordion. **Products:** name, variant, category on the summary; MRP/cost/margin stay expanded. **Inventory:** summary shows **catalog product name**, **variant**, and **category** when **linked**; when **unlinked**, show the **line name** plus a clear control to **add/link via the product repository** (reuse the existing inventory **edit** flow: picker + stub path). All **qty, cost, value, unit, reorder**, and **extra link context** move into the **accordion**.

## Critical Decisions

- **Decision 1: Breakpoint unchanged** — Still `md:hidden` mobile lists / `hidden md:block` tables; changes live in **`VendorsMobileList`**, **`ProductsMobileList`**, **`InventoryMobileList`** (and props from **`inventory/page.tsx`** if a dedicated callback is cleaner than **`onEdit`** alone).
- **Decision 2: Wrap behavior** — Use **`flex-wrap`** with **max two lines** for summary text (e.g. constrain row width + sensible gaps); avoid forcing everything onto one clipped line unless it fits naturally.
- **Decision 3: Inventory linked vs unlinked** — **Linked:** summary **name** = **linked product’s `name`**; **variant** and **category** from that product. **Unlinked:** summary **name** = **inventory line `name`**; expose **“Add to catalog” / “Link product”** (or equivalent) that **`onEdit(row)`** (or a thin wrapper) so the **existing dialog** handles **ProductPicker** + **stub** choice—no new API surface unless necessary.
- **Decision 4: Unlinked CTA placement** — Keep **Edit (pencil)** as today; add a **small secondary button or text action** on the collapsed row (stop propagation) so users can jump straight to linking without expanding—**or** rely on Edit only if a single control is enough (prefer explicit CTA per user request).

## Tasks

- [x] 🟩 **Step 1: Vendors — `VendorsMobileList`**
  - [x] 🟩 Collapsed: **name** (link), **contact**, **address** in a **horizontal, flex-wrap** summary (**≤2 lines**).
  - [x] 🟩 **Chevron + archive** unchanged; **phone + email** remain in **`MobileAccordionBody`**.

- [x] 🟩 **Step 2: Products — `ProductsMobileList`**
  - [x] 🟩 Collapsed: **name**, **variant**, **category** in a **horizontal, flex-wrap** summary (**≤2 lines**).
  - [x] 🟩 **MRP, cost, margin** in expand; **edit/archive** unchanged.

- [x] 🟩 **Step 3: Inventory — `InventoryMobileList` + page wiring**
  - [x] 🟩 Collapsed: **product name** (linked) or **line name** (unlinked), **variant**, **category** (latter two from linked product or **—** when unlinked); same **flex-wrap / two-line max** pattern.
  - [x] 🟩 **Unlinked:** visible **action** to add/link via product repository (**open existing edit dialog**—optionally pass **`onLinkProduct`** that equals **`startEdit`** if naming helps clarity).
  - [x] 🟩 Expand: **on hand, unit cost, value, unit, reorder**, and any **remaining link/line context**; preserve **low-stock** styling.

- [x] 🟩 **Step 4: Verify**
  - [x] 🟩 `npx tsc --noEmit`
  - [x] 🟩 Quick pass on **~320–390px** width: two-line wrap, linked vs unlinked inventory, vendor/product rows.
  - [x] 🟩 Set **Overall Progress** to **`100%`** and mark steps 🟩 in this file.
