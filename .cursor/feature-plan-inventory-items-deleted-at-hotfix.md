# Feature Implementation Plan — `inventory_items.deleted_at` live error

**Overall Progress:** `100%` *(code complete — smoke-test `/products` after deploy)*

## TLDR

The Products page ran a Supabase query that filtered `inventory_items` with `.is('deleted_at', null)`, but **`public.inventory_items` has no `deleted_at` column** in the real database (and in repo `supabase/schema.sql`). PostgREST returned a SQL error; the app showed it in red via `toast.error`. **Fix applied:** removed that filter and documented why in code. Repo audit: no other `inventory_items` + `deleted_at` usage.

## What the issue is (plain English)

| Layer | What happens |
|--------|----------------|
| **Database** | Table `inventory_items` is defined **without** `deleted_at` (hard delete on Inventory page, or rows stay forever). Same as V2 inventory design in migrations. |
| **App (bug)** | Products page loaded inventory lines for the **product components** picker using a filter “only rows where `deleted_at` is null” — copied from patterns used on `products`, `sales`, `customers`, etc., where `deleted_at` **does** exist. |
| **API** | Supabase/PostgREST builds SQL referencing a non-existent column → error message like *column inventory_items.deleted_at does not exist*. |
| **UX** | `loadInventoryOptions` fails → red toast as soon as Products mounts (with session ready). |

**Root cause:** schema drift between **mental model** (“every tenant table is soft-deleted”) and **actual** `inventory_items` table (no soft delete column).

## Critical Decisions

- **Decision 1: Remove erroneous filter in app** — Aligns with deployed schema immediately; no DB migration risk for live users.
- **Decision 2: Do not add `deleted_at` to `inventory_items` in this hotfix** — Unless product wants soft-delete for inventory lines; that would need migration, RLS, and Inventory UI changes. Out of scope for “stop the red error.”

## Tasks

- [x] 🟩 **Step 1: Remove invalid `deleted_at` filter on Products**
  - [x] 🟩 In `app/products/page.tsx`, drop `.is('deleted_at', null)` from `loadInventoryOptions` query; add one-line comment that `inventory_items` has no `deleted_at`.

- [x] 🟩 **Step 2: Repo-wide audit**
  - [x] 🟩 Grep `app/`, `lib/` — only Products used `deleted_at` on `inventory_items`; no other changes needed.

- [x] 🟩 **Step 3: Verify**
  - [x] 🟩 `npx tsc --noEmit`
  - [ ] 🟨 Manual (after deploy): open **Products** → no red toast; component picker lists inventory items.

- [x] 🟩 **Step 4: Changelog**
  - [x] 🟩 **Fixed** line under `CHANGELOG.md` `[Unreleased]`.

---

## Status emoji key

- 🟩 Done  
- 🟨 In Progress  
- 🟥 To Do  
