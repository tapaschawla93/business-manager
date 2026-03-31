-- V3 foundation: customers + sales.customer_id + product_components (tenant-safe).

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
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

create index if not exists customers_business_id_idx on public.customers (business_id);
create index if not exists customers_phone_idx on public.customers (phone);

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
  with check (business_id = public.current_business_id());

drop policy if exists "customers_update" on public.customers;
create policy "customers_update"
  on public.customers
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (business_id = public.current_business_id());

-- No delete policy by design (soft delete only pattern).

-- -----------------------------------------------------------------------------
-- sales.customer_id
-- -----------------------------------------------------------------------------
alter table public.sales
  add column if not exists customer_id uuid references public.customers (id) on delete restrict;

create index if not exists sales_customer_id_idx on public.sales (customer_id);

-- -----------------------------------------------------------------------------
-- product_components
-- -----------------------------------------------------------------------------
create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_per_unit numeric(10, 3) not null check (quantity_per_unit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, inventory_item_id)
);

create index if not exists product_components_product_id_idx on public.product_components (product_id);
create index if not exists product_components_inventory_item_id_idx on public.product_components (inventory_item_id);

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
