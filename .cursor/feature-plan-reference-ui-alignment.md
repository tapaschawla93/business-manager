# Feature Implementation Plan — Reference UI Alignment (visual-only)

**Overall Progress:** `75%`

## TLDR

Align the current app’s look-and-feel to the `/reference-ui` SaaS aesthetic by tuning the **design system** (tokens + typography + spacing), enforcing **shadcn primitives everywhere**, and standardizing **layout density** (cards/tables/forms). **No new fields, no new data reads, no Supabase/backend changes**—UI layer only.

## Critical Decisions

- Decision 1: **Visual-only scope** — ignore any reference fields/modules not present in the current app; do not introduce new forms/inputs or data structures.
- Decision 2: **System-first enforcement** — update tokens/primitives globally (radius, shadows, table padding, typography) before touching individual pages.
- Decision 3: **No new UI paradigms** — use existing Phase A–C components only (`Button`, `Input`, `Card`, `Table`, `Dialog`, `AlertDialog`, `Popover`, `Command`, `Sonner`, `PageHeader`).
- Decision 4: **Density targets from reference** — increase “roominess” via consistent paddings/gaps (e.g. `p-6`, `gap-6`, `space-y-6/8`) through primitives/config, not per-page ad-hoc classes.
- Decision 5: **Typography parity** — adopt Inter (reference uses Inter) via Next.js font loading; keep sizes/weights consistent (title 2xl semibold/bold, subtitle sm muted).

## Tasks:

- [x] 🟩 **Step 1: Reference UI audit (visual tokens only)**
  - [x] 🟩 Extracted: canvas (`zinc/gray-50`), Inter font, card radius ~2xl, table density (`px-6 py-4`), active nav pill (light green + border/shadow).
  - [x] 🟩 Documented “must match” targets as token/primitives changes below (single source of truth).

- [x] 🟩 **Step 2: Typography system parity**
  - [x] 🟩 Adopted Inter globally via Next.js font in `app/layout.tsx` (no data changes).
  - [ ] 🟥 Ensure headings/subtitles match reference hierarchy:
    - Titles: `text-2xl font-semibold` (desktop can bump to `text-3xl`)
    - Subtitles: `text-sm text-muted-foreground`
  - [x] 🟩 Table headers remain uppercase ~11px via `.ui-table-head`.

- [x] 🟩 **Step 3: Token tuning (colors, radii, shadows)**
  - [x] 🟩 Canvas token stays gray-50-like (`--background`).
  - [x] 🟩 Card radius tuned: `--radius-card` → `1rem` (reference-like).
  - [ ] 🟥 Shadow language: verify card/overlay shadows match reference (manual QA).
  - [x] 🟩 Primary green unchanged.

- [x] 🟩 **Step 4: Spacing / density enforcement (global, not per page)**
  - [x] 🟩 Card paddings updated to reference density (`p-6`, content `pt-0`).
  - [x] 🟩 Table density updated globally (`TableHead`/`TableCell` → `px-6 py-4`).
  - [ ] 🟨 Form rhythm: verify all forms follow `space-y-4` and `Button size=\"full\"` (finish during page migration).

- [x] 🟩 **Step 5: Layout polish (sidebar + main container)**
  - [x] 🟩 Sidebar header and nav padding tuned to reference (`p-6` header, `p-4` nav).
  - [x] 🟩 Active nav pill now includes subtle border/shadow (`ring-1 ring-primary/10 shadow-sm`).
  - [x] 🟩 Main container remains `max-w-7xl mx-auto px-4 py-6` (token-driven) and keeps mobile bottom padding/FAB clearance.

- [x] 🟩 **Step 6: Component enforcement sweep (no raw HTML)**
  - [x] 🟩 Verified no raw `<button>`, `<input>`, `<table>` usage in `app/` or `components/` (outside `components/ui/*`).
  - [ ] 🟥 Replace any remaining custom overrides that fight tokens (continue during page migration).

- [ ] 🟥 **Step 7: Page migration (visual only; no data changes)**
  - [ ] 🟥 Apply `PageHeader` + Card-based composition to remaining routes in this order:
    - Login → Settings → Dashboard → Products → Expenses → Sales
  - [ ] 🟥 Ensure every section is inside `Card` and tables/forms use primitives.

- [ ] 🟥 **Step 8: QA (visual + usability)**
  - [ ] 🟥 375px: bottom nav, FAB clearance, table horizontal scroll, dialog overflow.
  - [ ] 🟥 Desktop: sidebar fixed, main scroll, card spacing, table alignment.
  - [ ] 🟥 Keyboard: focus rings visible on nav/buttons/dialogs/combobox.

## Explicitly NOT touched

- Supabase logic, data fetching, RPCs, database schema, RLS, migrations.
- Introducing new fields present in `/reference-ui` but not in this app.

