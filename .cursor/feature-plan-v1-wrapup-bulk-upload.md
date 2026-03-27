# Feature Plan — V1 Wrap-up + Bulk Upload (Now)

**Overall Progress:** `100%`

## TLDR

Finish V1 polish before V2 by making sales customer fields optional, adding optional sale type (`B2C`/`B2B`/`B2B2C`), fixing Sales table header wording, removing redundant per-page export buttons, and shipping **working template download + bulk upload** for Products, Expenses, and Sales.

## Locked Decisions

- Sales customer fields are stored as columns on `public.sales` and are optional.
- `sale_type` values are uppercase only: `B2C | B2B | B2B2C`.
- Remove page-level Export CSV buttons from Sales and Expenses; keep centralized exports in Settings.
- Bulk upload is required now for each module separately (Sales, Products, Expenses).
- Sales upload format: one row per line item, grouped by `sale_ref`.
- Import behavior: partial success + downloadable error report.

## Tasks

- [x] 🟩 **Step 1: DB contract migration (forward-only)**
  - [x] 🟩 Altered `public.sales.customer_name` to nullable.
  - [x] 🟩 Added nullable columns: `customer_phone`, `customer_address`.
  - [x] 🟩 Added nullable `sale_type` with CHECK (`B2C`,`B2B`,`B2B2C`).
  - [x] 🟩 Replaced `public.save_sale`:
    - remove hard `customer_name required` rule
    - normalize blank optional fields to null
    - validate `sale_type` when provided
    - keep line/snapshot/totals logic unchanged

- [x] 🟩 **Step 2: Sync greenfield schema**
  - [x] 🟩 Updated `supabase/schema.sql` for the sales table + `save_sale`.

- [x] 🟩 **Step 3: Types and query alignment**
  - [x] 🟩 Updated `lib/types/sale.ts` for nullable customer fields + optional `sale_type`.
  - [x] 🟩 Updated `lib/queries/salesList.ts` select/types for new fields.

- [x] 🟩 **Step 4: Sales form updates**
  - [x] 🟩 Made customer name optional in `app/sales/components/SalesForm.tsx`.
  - [x] 🟩 Added optional customer phone and address inputs.
  - [x] 🟩 Added optional sale type selector (uppercase values).
  - [x] 🟩 Passing empty fields as null in `save_sale` RPC payload.

- [x] 🟩 **Step 5: Sales list updates**
  - [x] 🟩 Renamed header `Status` → `Mode of payment`.
  - [x] 🟩 Rendering null-safe customer display.
  - [x] 🟩 Showing optional `sale_type` in list.

- [x] 🟩 **Step 6: Remove redundant page exports**
  - [x] 🟩 Removed Sales page Export CSV action/button.
  - [x] 🟩 Removed Expenses page Export CSV action/button.
  - [x] 🟩 Keeping Settings exports as the single export surface.

- [x] 🟩 **Step 7: Shared bulk upload utilities**
  - [x] 🟩 Added reusable CSV parsing/validation helpers in `lib/importCsv.ts`.
  - [x] 🟩 Added row-level error report generation helper.
  - [x] 🟩 Added import result summary flow in Settings.

- [x] 🟩 **Step 8: Products bulk upload**
  - [x] 🟩 Download template for Products.
  - [x] 🟩 Upload CSV, validate rows, insert valid rows under RLS.
  - [x] 🟩 Partial success summary + error CSV.

- [x] 🟩 **Step 9: Expenses bulk upload**
  - [x] 🟩 Download template for Expenses.
  - [x] 🟩 Upload CSV, validate rows, insert valid rows under RLS.
  - [x] 🟩 Partial success summary + error CSV.

- [x] 🟩 **Step 10: Sales bulk upload**
  - [x] 🟩 Download template for Sales line-item format.
  - [x] 🟩 Grouping uploaded rows by `sale_ref`.
  - [x] 🟩 Group consistency validation.
  - [x] 🟩 Build `p_lines` and call `save_sale` per group.
  - [x] 🟩 Partial success summary + row/group-level error CSV.

- [x] 🟩 **Step 11: Settings import hub**
  - [x] 🟩 Added template download + upload controls for Products/Expenses/Sales.
  - [x] 🟩 Added module-wise import summary and failed-row CSV download.

- [x] 🟩 **Step 12: Documentation + trackers**
  - [x] 🟩 Updated `CHANGELOG.md`.
  - [x] 🟩 Updated `.cursor/feature-plan-reference-ui-alignment.md` with cross-plan note.
  - [x] 🟩 Updated `.cursor/feature-plan-ui-system-full.md` with cross-plan note.

- [x] 🟩 **Step 13: Review + verification**
  - [x] 🟩 Lint check on touched files (no issues).
  - [x] 🟩 Ran focused review checklist on touched files.
  - [x] 🟩 Local production build passes after fixes (`npm run build`), with no schema/RPC regression surfaced in client integration paths.

## Execution Order

1. Step 1–2 (schema + RPC + schema sync)  
2. Step 3–6 (types + sales UI + export cleanup)  
3. Step 7–11 (bulk upload and templates)  
4. Step 12–13 (docs + review)

