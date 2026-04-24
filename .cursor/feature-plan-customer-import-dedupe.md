# Feature plan: customer phone deduplication (CSV + workbook)

**Decision (point 3):** Use **digit-normalized** keys for duplicate detection (`normalizePhoneDigits`), with **fallback to trimmed raw** when normalization fails — same family of logic as sales / directory matching. Store the user’s **trimmed raw** phone on insert so display stays as entered.

**Overall progress: 100%** ✅

| Step | Status | Notes |
|------|--------|--------|
| 1. Add shared `customerPhoneDedupeKey()` in `lib/queries/customers.ts` | ✅ | Documented helper |
| 2. Wire `keyCustomers()` → helper in `lib/excel/dedupeRules.ts` | ✅ | Workbook + seeds use one rule |
| 3. `uploadWorkbook`: seed `customerKeys` from normalized keys; insert `phone` as trimmed raw | ✅ | Avoids changing stored formatting |
| 4. Customers CSV import: build `phonesSeen` with same keys | ✅ | Matches workbook |
| 5. Unit tests for `customerPhoneDedupeKey` | ✅ | Vitest |
| 6. `tsc` + `npm test` | ✅ | CI-safe |

## Context

- Per-module CSV and Dashboard **Restore** both create `customers` rows; dedupe must treat `+91 98765 43210` and `09876543210` as the same **identity** while still saving the CSV/workbook string as `phone` when possible.

## Out of scope

- DB unique constraints (unchanged).
- Migrating existing duplicate rows in old tenants.

---

## Related initiative (import / backup UX) — status **100%** ✅

| Area | Status |
|------|--------|
| Dashboard: export backup + restore only | ✅ |
| Settings: backup card + Help link | ✅ |
| `ModuleCsvMenu` (⋮) on Products, Sales, Expenses, Inventory, Vendors, Customers | ✅ |
| Help `/help`: workbook order, per-module CSV, backup behavior | ✅ |
| `downloadBackupWorkbook` aligned to `parseWorkbook` / `uploadWorkbook` | ✅ |
| Customer CSV template + import | ✅ |
| Customer / workbook phone dedupe (this plan) | ✅ |
