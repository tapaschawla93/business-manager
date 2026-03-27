# Feature Implementation Plan — Full UI system (foundation → pages)

**Overall Progress:** `62%` (Phases A–C done; Dashboard Phase D done — review; remaining D + E pending)

## TLDR

Replace incremental UI patches with a **single coherent system**: define **global layout**, **design tokens** (color, spacing, type), and **standardized primitives** first; then **migrate each route** to use only those primitives. Goal is **consistency** (same radii, density, hierarchy) and **one source of truth** for chrome + components—not local one-off class strings per page.

## Critical Decisions

- **System before screens:** No page-level styling passes until **tokens + layout shell + core components** are documented and implemented in shared modules.
- **Do not patch in place for this phase:** Prefer **new or clearly named wrappers** (e.g. `AppLayout`, `PageHeader`, `FormActions`) over scattering `className` fixes across pages; delete or narrow old patterns once migrated.
- **Tailwind + CSS variables:** Keep **semantic tokens** (`primary`, `muted`, `destructive`, `sidebar`, `surface`) in `:root`; Tailwind maps to `hsl(var(--token))`. Avoid raw hex in JSX except documented exceptions.
- **Typography scale:** Lock **font sizes, weights, line-height** for `display`, `title`, `body`, `caption`, `label`—pages only compose these utilities or small text components.
- **Spacing scale:** Use a **fixed spacing scale** (e.g. 4/8/12/16/24/32) for padding/gaps; **main content max-width** and **section vertical rhythm** defined once.
- **Components are contracts:** Button variants/sizes, Input states, Card regions (header/body/footer) have **named props or subcomponents**—no duplicate “almost the same” buttons across pages.
- **Mobile-first:** Bottom nav height, safe areas, and **FAB offset** are **constants** in one place (CSS variables or Tailwind theme), not re-guessed per page.

## Phase A — Global layout

**Outcome:** Every authenticated route shares the same chrome; login (and any future public routes) stay outside the shell.

- [x] 🟩 **A1: Layout regions**
  - [x] 🟩 Define regions: `sidebar` (`--sidebar-width`), `main` (scroll, `bg-background`), `mobile-nav` (`--mobile-nav-height`), no topbar.
  - [x] 🟩 **Main container:** `max-w-6xl`, `px` / `pb` via `--main-padding-x`, `--main-bottom-mobile`, `--main-bottom-desktop`.
  - [x] 🟩 **Sidebar:** logo, nav, token-driven active, logout + user footer.
  - [x] 🟩 **Mobile nav:** five items, `h-11` icon targets, active matches sidebar.
  - [x] 🟩 **Route gating:** `AppChrome` — shell except `/login`; login uses `bg-background`.

- [x] 🟩 **A2: Navigation consistency**
  - [x] 🟩 **`lib/nav.ts`:** `MAIN_NAV_ITEMS` + `isMainNavActive()` — sidebar + mobile nav import only this.
  - [x] 🟩 Active logic centralized in `isMainNavActive`.

- [ ] 🟨 **A3: Shell QA checklist**
  - [ ] 🟥 Manual 375px / focus rings (reduced-motion global CSS added).

## Phase B — Design system (tokens)

**Outcome:** Designers and engineers share one vocabulary; pages rarely introduce new colors or arbitrary spacing.

- [x] 🟩 **B1: Color roles**
  - [x] 🟩 `:root` tokens for background, card, border, primary, accent, destructive, finance mirrors (`--finance-positive` / `--finance-negative`), Tailwind `finance.*` + utilities `.text-finance-positive` / `.text-finance-negative`.
  - [x] 🟩 Pages adopt utilities in **Phase D** (not executed here).

- [x] 🟩 **B2: Typography**
  - [x] 🟩 `globals.css` `@layer components`: `.ui-page-title`, `.ui-page-description`, `.ui-section-title`, `.ui-table-head`.

- [x] 🟩 **B3: Spacing & radius**
  - [x] 🟩 `--radius` (controls), `--radius-card` (surfaces); Tailwind `rounded-card`; cards/dialogs/popovers use `rounded-card`.

- [x] 🟩 **B4: Motion & a11y**
  - [x] 🟩 `prefers-reduced-motion` global shorten animations/transitions.

## Phase C — Component standardization

**Outcome:** All interactive UI goes through shared primitives; variants are enumerable, not invented per screen.

- [x] 🟩 **C1: Button**
  - [x] 🟩 Variants: default, outline, ghost, destructive, secondary, link; **fixed `cn(buttonVariants(), className)` merge**.
  - [x] 🟩 Sizes: default, sm, lg, icon, **`full`** (h-12 w-full).
  - [x] 🟩 **FAB** uses `--mobile-nav-height` + `--fab-gap`.

- [x] 🟩 **C2: Input & form controls**
  - [x] 🟩 `Input` / `Textarea`: `rounded-lg`, `aria-invalid` border/ring.
  - [x] 🟩 **PaymentToggle:** h-10 segmented control, primary/outline tokens.
  - [x] 🟩 **ProductPicker** trigger: h-10 (matches Input) — minimal alignment (Phase C5).

- [x] 🟩 **C3: Card & surface**
  - [x] 🟩 Card padding unified (`px-4 py-4` / md:6); CardTitle `text-lg`.
  - [x] 🟩 **`PageHeader`** — `components/PageHeader.tsx` (title + description + optional actions); **Phase D** wires pages.

- [x] 🟩 **C4: Data display**
  - [x] 🟩 **Table:** optional `stickyHeader`; `TableHead` uses `.ui-table-head`.
  - [x] 🟩 **Badge:** `neutral` alias + existing variants.

- [x] 🟩 **C5: Overlays**
  - [x] 🟩 **`radixOverlayClassName`** in `overlay-classes.ts` — Dialog, Sheet, AlertDialog.
  - [x] 🟩 Popover / Command `rounded-card`; Command input **h-10**.

- [x] 🟩 **C6: Feedback**
  - [x] 🟩 **Sonner:** default `duration`, `rounded-card` toast classes, success/error border hints.

## Phase D — Page-by-page migration (on top of the system)

**Rule:** Each page PR removes **local** layout/header/table/button patterns and uses **only** Phase A–C building blocks. **No new Supabase calls** unless separately specified.

- [ ] 🟥 Login → Settings
- [x] 🟩 **Dashboard** — `PageHeader`, `ui-page-description` for loading/empty, KPI values `text-finance-positive` / `text-finance-negative`, `KPICard`/`TopProductsTable` use default `Card` + `ui-section-title` (no duplicate radii).
- [ ] 🟨 Products → Expenses → Sales → cleanup (starting with Products UI cleanup).
  - 🟨 Products route currently has a visual rebuild, but still misses Phase A layout wrapper (`AppShell`) and includes a `Variant` column vs the required dashboard spec.

## Phase E — Verification

- [ ] 🟥 E1–E3 manual / regression.

## Dependencies & files (reference only)

- **Tokens / base:** `app/globals.css`, `tailwind.config.ts`
- **Layout:** `components/layout/*`, `lib/nav.ts`, `app/layout.tsx`
- **Primitives:** `components/ui/*`, `components/PageHeader.tsx`, `components/Fab.tsx`, `components/PaymentToggle.tsx`

## Explicitly out of scope (unless you add a task)

- New features, new queries/RPCs, or redesign of information architecture beyond current routes.
- Dark mode (can add a later task: duplicate token set under `.dark`).

---

*Phases **A–C** implemented: execute **Phase D** page order next.*

Note: V1 wrap-up work for sales optional customer fields, sale type, and bulk upload templates/imports is tracked separately in `.cursor/feature-plan-v1-wrapup-bulk-upload.md`.
