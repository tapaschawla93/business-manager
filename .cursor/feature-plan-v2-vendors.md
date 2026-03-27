# Feature Implementation Plan — Vendors (V2)

**Overall Progress:** `0%`

## TLDR
Implement Vendors per `prd.v2.4.2`: vendor name required; contact person/phone/address/notes optional; UI/UX consistent with current app; add vendor bulk upload + template download; re-enable expenses vendor picker + free-text fallback in the same slice.

## Critical Decisions

- Decision 1: Keep existing `email` as optional (backward compatible) while adding PRD-required fields (`contact_person`, `address`).
- Decision 2: Bulk upload uses partial success (row-by-row inserts + downloadable error CSV).
- Decision 3: Expenses vendor linkage: set `vendor_id` when user picks vendor; otherwise `vendor_id` null and `vendor_name` is free text. Free-text does not auto-create vendor.

## Tasks:

- [ ] 🟥 **Step 1: Database + schema sync (vendors fields)**
  - [ ] 🟥 Add forward migration to extend `public.vendors` with nullable:
    - `contact_person text`
    - `address text`
    - keep `notes`, `phone` nullable; `name` required
  - [ ] 🟥 Ensure RLS/policies remain correct (no widening)
  - [ ] 🟥 Update `supabase/schema.sql` to match

- [ ] 🟥 **Step 2: Types + queries alignment**
  - [ ] 🟥 Update `lib/types/vendor.ts` to include `contact_person` and `address` (nullable)
  - [ ] 🟥 Ensure `lib/queries/vendors.ts` continues to fetch these fields correctly

- [ ] 🟥 **Step 3: Vendors UI (consistent with Products/Expenses)**
  - [ ] 🟥 Update `app/vendors/page.tsx`
    - Create vendor dialog fields:
      - Required: name
      - Optional: contact_person, phone, address, notes (and keep email optional)
    - Vendors table shows key columns (Name, Phone, Contact person, Address)
    - Keep loading/empty states and Card/Table styling consistent
  - [ ] 🟥 Update `app/vendors/[id]/page.tsx`
    - Display contact person + address in the profile section
    - Keep existing expense history view

- [ ] 🟥 **Step 4: Expenses vendor selector + free-text fallback**
  - [ ] 🟥 Update `app/expenses/components/ExpenseForm.tsx`
    - If vendor picked: set `vendor_id` and `vendor_name` (vendor’s name)
    - If free text typed: set `vendor_id = null`, keep `vendor_name`
    - Save/update writes `vendor_id` only when selected; otherwise null
    - UX copy matches PRD: free-text does not auto-create vendor

- [ ] 🟥 **Step 5: Vendor bulk upload (template + upload)**
  - [ ] 🟥 Add template download on Vendors screen:
    - CSV headers: `name,contact_person,phone,address,notes,email` (only `name` required)
  - [ ] 🟥 Add CSV upload on Vendors screen:
    - Validate required name
    - Insert row-by-row with per-row error capture
    - Download `vendors_import_errors.csv` on failures
    - Toast summary: inserted vs failed
  - [ ] 🟥 Reuse `lib/importCsv.ts` helpers

- [ ] 🟥 **Step 6: Documentation + trackers**
  - [ ] 🟥 Update `CHANGELOG.md` under Unreleased
  - [ ] 🟥 Append vendor learnings to `docs/knowledgebase.md`
  - [ ] 🟥 Keep this plan updated with emoji statuses and progress %

- [ ] 🟥 **Step 7: Review + verification**
  - [ ] 🟥 Run local `npm run build`
  - [ ] 🟥 Manual QA:
    - Create vendor with only name
    - Create vendor with optional fields
    - Bulk upload vendors with mixed valid/invalid rows (ensure partial success)
    - Expense form: pick vendor sets vendor_id; free-text keeps vendor_id null
    - Vendor detail shows linked expenses by vendor_id OR name fallback

