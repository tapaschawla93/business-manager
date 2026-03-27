-- Vendors baseline + optional columns (prd.v2.4.2).
--
-- Why this file is not only ALTER: some databases never applied
-- 20260326120000_inventory_vendors.sql, so public.vendors may not exist.
-- This migration is safe to run on:
--   - empty / partial histories (creates vendors + expenses.vendor_id), or
--   - DBs that already have vendors from 20260326120000 (adds columns only).
--
-- Stock/inventory triggers and inventory table still live in 20260326120000 only.

-- -----------------------------------------------------------------------------
-- 1) Vendors table (create if missing — same core shape as inventory migration)
-- -----------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_business_name_key unique (business_id, name)
);

-- PRD fields (also upgrades older vendors rows created without these columns)
alter table public.vendors
  add column if not exists contact_person text;

alter table public.vendors
  add column if not exists address text;

create index if not exists vendors_business_id_idx on public.vendors (business_id);

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at
before update on public.vendors
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.vendors enable row level security;

drop policy if exists "vendors_select" on public.vendors;
drop policy if exists "vendors_insert" on public.vendors;
drop policy if exists "vendors_update" on public.vendors;

create policy "vendors_select"
  on public.vendors
  for select
  using (business_id = public.current_business_id());

create policy "vendors_insert"
  on public.vendors
  for insert
  with check (business_id = public.current_business_id());

create policy "vendors_update"
  on public.vendors
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

-- -----------------------------------------------------------------------------
-- 2) Expenses → vendors (+ optional product link if inventory migration skipped)
-- -----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists product_id uuid references public.products (id) on delete restrict;

alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

create index if not exists expenses_product_id_idx on public.expenses (product_id);
create index if not exists expenses_vendor_id_idx on public.expenses (vendor_id);

-- Validates vendor_id / product_id belong to same business (columns added above if missing)
create or replace function public.expenses_validate_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null then
    if not exists (
      select 1
      from public.products pr
      where pr.id = new.product_id
        and pr.business_id = new.business_id
        and pr.deleted_at is null
    ) then
      raise exception 'Expense product_id must reference an active product in this business';
    end if;
  end if;

  if new.vendor_id is not null then
    if not exists (
      select 1
      from public.vendors v
      where v.id = new.vendor_id
        and v.business_id = new.business_id
    ) then
      raise exception 'Expense vendor_id must reference a vendor in this business';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_validate_refs_trigger on public.expenses;
create trigger expenses_validate_refs_trigger
before insert or update on public.expenses
for each row
execute function public.expenses_validate_refs();
