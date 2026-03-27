# Feature Implementation Plan — Vendors (V2)

**Overall Progress:** `100%` *(owner confirmed app working; Step 7 signed off)*

## TLDR
Implement Vendors per `prd.v2.4.2`: vendor name required; contact person/phone/address/notes optional; UI/UX consistent with current app; add vendor bulk upload + template download; re-enable expenses vendor picker + free-text fallback in the same slice.

## Critical Decisions

- Decision 1: Keep existing `email` as optional (backward compatible) while adding PRD-required fields (`contact_person`, `address`).
- Decision 2: Bulk upload uses partial success (row-by-row inserts + downloadable error CSV).
- Decision 3: Expenses vendor linkage: set `vendor_id` when user picks vendor; otherwise `vendor_id` null and `vendor_name` is free text. Free-text does not auto-create vendor.

## Tasks:

- [x] 🟩 **Step 1: Database + schema sync (vendors fields)**
  - [x] 🟩 Add forward migration to extend `public.vendors` with nullable:
    - `contact_person text`
    - `address text`
    - keep `notes`, `phone` nullable; `name` required
  - [x] 🟩 Ensure RLS/policies remain correct (no widening)
  - [x] 🟩 Update `supabase/schema.sql` to match

- [x] 🟩 **Step 2: Types + queries alignment**
  - [x] 🟩 Update `lib/types/vendor.ts` to include `contact_person` and `address` (nullable)
  - [x] 🟩 Ensure `lib/queries/vendors.ts` continues to fetch these fields correctly

- [x] 🟩 **Step 3: Vendors UI (consistent with Products/Expenses)**
  - [x] 🟩 Update `app/vendors/page.tsx`
    - Create vendor dialog fields:
      - Required: name
      - Optional: contact_person, phone, address, notes (and keep email optional)
    - Vendors table shows key columns (Name, Phone, Contact person, Address)
    - Keep loading/empty states and Card/Table styling consistent
  - [x] 🟩 Update `app/vendors/[id]/page.tsx`
    - Display contact person + address in the profile section
    - Keep existing expense history view

- [x] 🟩 **Step 4: Expenses vendor selector + free-text fallback**
  - [x] 🟩 Update `app/expenses/components/ExpenseForm.tsx`
    - If vendor picked: set `vendor_id` and `vendor_name` (vendor’s name)
    - If free text typed: set `vendor_id = null`, keep `vendor_name`
    - Save/update writes `vendor_id` only when selected; otherwise null
    - UX copy matches PRD: free-text does not auto-create vendor

- [x] 🟩 **Step 5: Vendor bulk upload (template + upload)**
  - [x] 🟩 Add template download on Vendors screen:
    - CSV headers: `name,contact_person,phone,address,notes,email` (only `name` required)
  - [x] 🟩 Add CSV upload on Vendors screen:
    - Validate required name
    - Insert row-by-row with per-row error capture
    - Download `vendors_import_errors.csv` on failures
    - Toast summary: inserted vs failed
  - [x] 🟩 Reuse `lib/importCsv.ts` helpers

- [x] 🟩 **Step 6: Documentation + trackers**
  - [x] 🟩 Update `CHANGELOG.md` under Unreleased
  - [x] 🟩 Append vendor learnings to `docs/knowledgebase.md`
  - [x] 🟩 Keep this plan updated with emoji statuses and progress %

- [x] 🟩 **Step 7: Review + verification**
  - [x] 🟩 Run local `npm run build` *(automated check)*
  - [x] 🟩 **Owner manual QA + approval** *(confirmed working in dev)*
    - [x] 🟩 Migration `20260327200000_vendors_contact_address.sql` applied / compatible DB
    - [x] 🟩 Vendors CRUD + detail + bulk template/upload
    - [x] 🟩 Expense vendor picker + free-text; nav includes **Vendors** (sidebar + bottom bar via `lib/nav.ts`)
