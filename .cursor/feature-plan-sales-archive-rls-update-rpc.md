# Feature Implementation Plan

**Overall Progress:** `50%` (code fix in repo; apply migrations on your Supabase project for `update_sale` / PostgREST cache)

## TLDR

Fix **archive** when `archive_sale` RPC is missing: client fallback must not use **UPDATE … RETURNING** with `.select()` on `sales`, or PostgREST applies **SELECT** RLS to the archived row and fails with **new row violates row-level security policy for table "sales"**. **Edit sale** still needs **`update_sale`** on the database (migration `20260401160000` + schema reload); there is no client substitute because **`sale_items`** has no direct INSERT/DELETE for clients.

## Critical Decisions

- **Decision 1: Archive update without `.select()`** — Same pattern as `20250329120000_archive_update_rls_no_definer_in_check.sql`: soft-delete PATCH must not return rows that fail active-only SELECT policies (`deleted_at is null`).
- **Decision 2: Verify archive with a follow-up SELECT** — After update, confirm the sale no longer appears as active instead of relying on RETURNING.
- **Decision 3: `update_sale` remains migration-only** — RLS blocks client writes to `sale_items`; only the RPC can replace lines safely.

## Tasks:

- [x] 🟩 **Step 1: Fix client archive RLS error**
  - [x] 🟩 Remove `.select()` from `sales` soft-delete update in `lib/archiveSale.ts`
  - [x] 🟩 Verify success by checking the sale is no longer visible under active `sales` SELECT policy

- [ ] 🟥 **Step 2: Deploy RPCs + refresh API (on your Supabase project)**
  - [ ] 🟥 Run migration `20260401160000_sale_archive_update_inventory_delete_rpc.sql` (`supabase db push` or SQL editor)
  - [ ] 🟥 Optional: run `20260401180000_postgrest_reload_schema.sql` so PostgREST picks up `update_sale` / `archive_sale`

- [ ] 🟥 **Step 3: Reload app**
  - [ ] 🟥 Hard refresh the web app after DB changes
