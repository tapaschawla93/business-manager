# Feature Implementation Plan

**Overall Progress:** `100%` (all planned implementation steps completed)

## TLDR
Build V3 in 4 feature tracks (monthly chart, customers, product components, unified Excel backup/upload) using the confirmed order: DB foundations first, then RPC updates, then dashboard chart, customers UI, unified settings flow, and finally cleanup of old CSV buttons. Keep backward compatibility: products without `product_components` must behave exactly as today.

## Critical Decisions
Key architectural/implementation choices made during exploration:
- Decision 1: Update `save_sale` in-place - single client/version in production, no need for `save_sale_v2`.
- Decision 2: Customer auto-link inside sale RPC transaction - ensures atomicity and avoids app/DB drift.
- Decision 3: Hybrid upload architecture - client parses/previews workbook; Supabase RPCs do authoritative dedupe + writes; no new Next API route.
- Decision 4: Backward-compatible component deduction - only deduct component stock when `product_components` exist for that product.

## Tasks:

- [x] 🟩 **Step 0: Confirm scope and sequencing**
  - [x] 🟩 Lock implementation order for all 4 parts + cleanup step
  - [x] 🟩 Confirm key constraints (in-place RPC update, customer auto-link, hybrid upload, backward compatibility)

- [x] 🟩 **Step 1: DB foundations (customers + sales FK + product components + RLS/indexes)**
  - [x] 🟩 Create migration: `supabase/migrations/20260401200000_v3_customers_product_components_foundation.sql`
  - [x] 🟩 Update `supabase/schema.sql` to match migration

### Exact SQL (planned) - Step 1 migration

```sql
-- 1) customers table
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  phone text,
  address text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_id_idx
  on public.customers (business_id);

create index if not exists customers_phone_idx
  on public.customers (phone);

-- active-row uniqueness by business + phone (when phone present)
create unique index if not exists customers_business_phone_active_uidx
  on public.customers (business_id, phone)
  where deleted_at is null and phone is not null and btrim(phone) <> '';

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.customers enable row level security;

drop policy if exists "customers_select_active" on public.customers;
create policy "customers_select_active"
  on public.customers
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert"
  on public.customers
  for insert
  with check (
    business_id = public.current_business_id()
  );

drop policy if exists "customers_update" on public.customers;
create policy "customers_update"
  on public.customers
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (
    business_id = public.current_business_id()
  );

-- no delete policy by design

-- 2) sales.customer_id link
alter table public.sales
  add column if not exists customer_id uuid
  references public.customers (id) on delete restrict;

create index if not exists sales_customer_id_idx
  on public.sales (customer_id);

-- 3) product_components table
create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_per_unit numeric(10,3) not null check (quantity_per_unit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, inventory_item_id)
);

create index if not exists product_components_product_id_idx
  on public.product_components (product_id);

create index if not exists product_components_inventory_item_id_idx
  on public.product_components (inventory_item_id);

drop trigger if exists set_product_components_updated_at on public.product_components;
create trigger set_product_components_updated_at
before update on public.product_components
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.product_components enable row level security;

drop policy if exists "product_components_select" on public.product_components;
create policy "product_components_select"
  on public.product_components
  for select
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  );

drop policy if exists "product_components_insert" on public.product_components;
create policy "product_components_insert"
  on public.product_components
  for insert
  with check (
    exists (
      select 1
      from public.products p
      join public.inventory_items ii on ii.id = product_components.inventory_item_id
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
        and ii.business_id = p.business_id
        and ii.deleted_at is null
    )
  );

drop policy if exists "product_components_update" on public.product_components;
create policy "product_components_update"
  on public.product_components
  for update
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.inventory_items ii on ii.id = product_components.inventory_item_id
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
        and ii.business_id = p.business_id
        and ii.deleted_at is null
    )
  );

drop policy if exists "product_components_delete" on public.product_components;
create policy "product_components_delete"
  on public.product_components
  for delete
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  );
```

---

- [x] 🟩 **Step 2: Update sale RPCs (in-place) for customer auto-link + component deduction**
  - [x] 🟩 Create migration: `supabase/migrations/20260401210000_v3_save_sale_customer_components.sql`
  - [x] 🟩 Update `save_sale` and `update_sale` in `supabase/schema.sql`
  - [x] 🟩 Add grant/revoke + optional `postgrest reload schema` migration

### Updated `save_sale` RPC signature (planned, unchanged params)

```sql
create or replace function public.save_sale(
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null
) returns jsonb
```

### RPC behavior additions (planned)
- Customer logic inside transaction:
  - if trimmed `p_customer_phone` present:
    - lookup active `customers` by `(business_id, phone)`
    - reuse or insert customer
    - set `sales.customer_id`
- keep `sales.customer_name` / `customer_phone` / `customer_address` as snapshot/fallback
- Component stock deduction inside line loop:
  - for each sold product, query `product_components`
  - if none found: do nothing (backward compatible)
  - if found: deduct each component qty (`quantity_per_unit * sale_qty`) from `inventory_items` stock path
- Mirror same logic in `update_sale` after restoring previous line effects

---

- [x] 🟩 **Step 3: Dashboard monthly performance RPC + chart**
  - [x] 🟩 Create migration: `supabase/migrations/20260401220000_v3_monthly_performance_rpc.sql`
  - [x] 🟩 Add query parser and fetch in `lib/queries/dashboard.ts`
  - [x] 🟩 Add responsive Recharts component under KPI cards in `app/page.tsx`

### `get_monthly_performance` RPC signature + return shape (planned)

```sql
create or replace function public.get_monthly_performance(
  p_from date,
  p_to date
)
returns table (
  month int,
  year int,
  revenue numeric(12,2),
  expenses numeric(12,2),
  profit numeric(12,2)
)
```

- SQL will:
  - validate auth + `current_business_id()`
  - generate month buckets (`generate_series`) between range
  - left join sales/expenses aggregates
  - return zero-filled months

### New files (planned)
- `components/dashboard/MonthlyPerformanceChart.tsx`
- (optional) `lib/dashboard/monthLabel.ts` if month formatting helper is extracted

---

- [x] 🟩 **Step 4: Customers UI (route, list, detail, repeat filter)**
  - [x] 🟩 Add `/customers` route and nav entry
  - [x] 🟩 Build list + search + repeat-customer filter + row highlight
  - [x] 🟩 Build customer detail with aggregate summary + order history

### Planned component/file structure
- `app/customers/page.tsx`
- `app/customers/components/CustomersTable.tsx`
- `app/customers/components/CustomersSearchBar.tsx`
- `app/customers/components/RepeatCustomerToggle.tsx`
- `app/customers/components/CustomerDetailDialog.tsx` (or route segment)
- `lib/queries/customers.ts`
- `lib/types/customer.ts`
- `lib/nav.ts` (add Customers nav item)

### UI rules to enforce
- repeat customers (2+ orders) always `#f0fdf4` row background
- checkbox filters to only repeat customers
- columns: Name, Phone, Order Count, Total Spent, Last Order Date
- row click opens detail with full order history

---

- [x] 🟩 **Step 5: Unified Excel backup/template/upload in Settings**
  - [x] 🟩 Install dependency: `xlsx`
  - [x] 🟩 Add 3-button Settings flow (Download Backup, Download Template, Upload Data)
  - [x] 🟩 Implement tab-wise append-only upload with summary/errors and module dedupe keys

### Settings page changes (planned)
- Replace module-level CSV hub UI in `app/settings/page.tsx` with:
  - `Download Backup` (all active rows, multi-sheet workbook)
  - `Download Template` (same sheets, headers + sample row)
  - `Upload Data` (single workbook, per-sheet processing)
- keep dashboard backup button in `app/page.tsx`, wired to same exporter utility

### Planned new files
- `lib/excel/workbookSchema.ts`
- `lib/excel/downloadBackupWorkbook.ts`
- `lib/excel/downloadTemplateWorkbook.ts`
- `lib/excel/parseWorkbook.ts`
- `lib/excel/uploadWorkbook.ts`
- `lib/excel/dedupeRules.ts`
- `lib/types/workbook.ts`

### Upload processing order (locked)
1. Products
2. Inventory
3. Customers
4. Vendors
5. Sales
6. Expenses

---

- [x] 🟩 **Step 6: Cleanup old per-module CSV buttons**
  - [x] 🟩 Remove individual template/upload controls from Products, Sales, Expenses, Inventory, Vendors pages
  - [x] 🟩 Keep only unified Settings flow + dashboard backup shortcut

### Target files to clean
- `app/products/page.tsx`
- `app/sales/page.tsx`
- `app/expenses/page.tsx`
- `app/inventory/page.tsx`
- `app/vendors/page.tsx`
- `app/page.tsx` (dashboard backup button wiring only)

---

## Non-goals in this sprint
- No Next.js API route introduction
- No hard-delete workflows
- No forced migration of old sales with null `customer_id`
- No behavior change for products lacking `product_components` entries (must remain unchanged)
