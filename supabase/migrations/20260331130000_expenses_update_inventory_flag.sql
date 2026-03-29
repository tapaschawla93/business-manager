-- Optional flag: when false, linked expenses do not call inventory_apply_delta.
--
-- Safe for:
--   - Normal DBs (idempotent ALTER / trigger refresh)
--   - Empty or partial DBs (e.g. SQL Editor without earlier migrations): ensures
--     businesses → profiles → helpers → vendors → products → inventory →
--     inventory_apply_delta before creating expenses (FK + trigger targets).

-- =============================================================================
-- 0) Core tenancy + catalog + stock ledger (all idempotent)
-- =============================================================================

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Businesses + profiles
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses add column if not exists deleted_at timestamptz;

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  full_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_business_id_key unique (business_id)
);

-- Starter / legacy public.profiles often exists without business_id (CREATE TABLE IF NOT EXISTS skips above).
alter table public.profiles add column if not exists business_id uuid references public.businesses (id) on delete restrict;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;

update public.profiles
set
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;

alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();

alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column updated_at set not null;

-- CREATE TABLE may have already added this; legacy DBs may lack it. Unique indexes raise 42P07, not 42710.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and c.conname = 'profiles_business_id_key'
  ) then
    alter table public.profiles
      add constraint profiles_business_id_key unique (business_id);
  end if;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
    and deleted_at is null;
$$;

create or replace function public.create_business_for_user(p_business_name text default 'My Business')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_existing uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select business_id into v_existing
  from public.profiles
  where id = auth.uid()
    and deleted_at is null;

  if v_existing is not null then
    return v_existing;
  end if;

  v_name := coalesce(nullif(trim(p_business_name), ''), 'My Business');

  insert into public.businesses (name)
  values (v_name)
  returning id into v_business_id;

  insert into public.profiles (id, business_id)
  values (auth.uid(), v_business_id)
  on conflict (id) do update
    set
      business_id = coalesce(public.profiles.business_id, excluded.business_id),
      updated_at = now();

  return v_business_id;
end;
$$;

revoke all on function public.create_business_for_user(text) from public;
grant execute on function public.create_business_for_user(text) to authenticated;

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Select own business" on public.businesses;
drop policy if exists "Update own business" on public.businesses;
drop policy if exists "Insert business (authenticated)" on public.businesses;

create policy "Select own business"
  on public.businesses
  for select
  using (id = public.current_business_id() and deleted_at is null);

create policy "Update own business"
  on public.businesses
  for update
  using (id = public.current_business_id() and deleted_at is null)
  with check (id = public.current_business_id());

drop policy if exists "Select own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;

create policy "Select own profile"
  on public.profiles
  for select
  using (id = auth.uid() and deleted_at is null);

create policy "Update own profile"
  on public.profiles
  for update
  using (id = auth.uid() and deleted_at is null)
  with check (
    id = auth.uid()
    and business_id = (
      select p.business_id from public.profiles p where p.id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Vendors (for expenses.vendor_id)
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

alter table public.vendors add column if not exists business_id uuid references public.businesses (id) on delete restrict;

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
-- Products (for expenses.product_id)
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  variant text,
  category text not null,
  mrp numeric(12, 2) not null,
  cost_price numeric(12, 2) not null,
  hsn_code text,
  tax_pct numeric(5, 2),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_business_id_name_key unique (business_id, name),
  constraint products_mrp_nonneg check (mrp >= 0),
  constraint products_cost_price_nonneg check (cost_price >= 0),
  constraint products_tax_pct_range check (
    tax_pct is null or (tax_pct >= 0 and tax_pct <= 100)
  )
);

alter table public.products add column if not exists business_id uuid references public.businesses (id) on delete restrict;
alter table public.products add column if not exists variant text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists mrp numeric(12, 2);
alter table public.products add column if not exists cost_price numeric(12, 2);
alter table public.products add column if not exists hsn_code text;
alter table public.products add column if not exists tax_pct numeric(5, 2);
alter table public.products add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists created_at timestamptz;
alter table public.products add column if not exists updated_at timestamptz;

create index if not exists products_business_id_idx on public.products (business_id);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;

create policy "products_select"
  on public.products
  for select
  using (business_id = public.current_business_id() and deleted_at is null);

create policy "products_insert"
  on public.products
  for insert
  with check (business_id = public.current_business_id());

create policy "products_update"
  on public.products
  for update
  using (business_id = public.current_business_id() and deleted_at is null)
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.business_id = products.business_id
    )
  );

-- -----------------------------------------------------------------------------
-- Inventory ledger + delta helper (for expenses_sync_inventory)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory (
  product_id uuid primary key references public.products (id) on delete restrict,
  business_id uuid not null references public.businesses (id) on delete restrict,
  quantity_on_hand numeric(12, 3) not null default 0 check (quantity_on_hand >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_business_id_idx on public.inventory (business_id);

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
before update on public.inventory
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.inventory enable row level security;

drop policy if exists "inventory_select" on public.inventory;
drop policy if exists "inventory_insert" on public.inventory;
drop policy if exists "inventory_update" on public.inventory;

create policy "inventory_select"
  on public.inventory
  for select
  using (business_id = public.current_business_id());

create policy "inventory_insert"
  on public.inventory
  for insert
  with check (business_id = public.current_business_id());

create policy "inventory_update"
  on public.inventory
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create or replace function public.inventory_apply_delta(
  p_business_id uuid,
  p_product_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
begin
  if p_business_id is null or p_product_id is null then
    raise exception 'inventory_apply_delta: business_id and product_id required';
  end if;
  if p_delta is null then
    raise exception 'inventory_apply_delta: delta required';
  end if;
  if p_delta = 0 then
    return;
  end if;

  insert into public.inventory (business_id, product_id, quantity_on_hand)
  values (p_business_id, p_product_id, 0)
  on conflict (product_id) do nothing;

  update public.inventory
  set
    quantity_on_hand = round((public.inventory.quantity_on_hand + p_delta)::numeric, 3),
    updated_at = now()
  where product_id = p_product_id
    and business_id = p_business_id
  returning quantity_on_hand into v_qty;

  if v_qty is null or v_qty < 0 then
    raise exception 'Insufficient stock for this sale (inventory would go negative).';
  end if;
end;
$$;

revoke all on function public.inventory_apply_delta(uuid, uuid, numeric) from public;

-- =============================================================================
-- 1) Ensure expenses table (+ vendor / product links)
-- =============================================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  date timestamptz not null default now(),
  vendor_name text not null,
  item_description text not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_cost numeric(10, 2) not null check (unit_cost >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  payment_mode text not null check (payment_mode in ('cash', 'online')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses add column if not exists business_id uuid references public.businesses (id) on delete restrict;
alter table public.expenses add column if not exists deleted_at timestamptz;

alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

alter table public.expenses
  add column if not exists product_id uuid references public.products (id) on delete restrict;

create index if not exists expenses_business_id_idx on public.expenses (business_id);
create index if not exists expenses_vendor_id_idx on public.expenses (vendor_id);
create index if not exists expenses_product_id_idx on public.expenses (product_id);

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.expenses enable row level security;

drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;

create policy "expenses_select"
  on public.expenses
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "expenses_insert"
  on public.expenses
  for insert
  with check (business_id = public.current_business_id());

create policy "expenses_update"
  on public.expenses
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.business_id = expenses.business_id
    )
  );

-- =============================================================================
-- 2) update_inventory + inventory sync trigger
-- =============================================================================

alter table public.expenses
  add column if not exists update_inventory boolean not null default true;

comment on column public.expenses.update_inventory is
  'When true and product_id is set, expense quantity adjusts inventory via expenses_sync_inventory trigger.';

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

create or replace function public.expenses_sync_inventory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    if new.deleted_at is null
       and new.product_id is not null
       and coalesce(new.update_inventory, true) then
      perform public.inventory_apply_delta(new.business_id, new.product_id, new.quantity);
    end if;
    return new;
  elsif tg_op = 'update' then
    if old.deleted_at is null
       and old.product_id is not null
       and coalesce(old.update_inventory, true) then
      perform public.inventory_apply_delta(old.business_id, old.product_id, -old.quantity);
    end if;
    if new.deleted_at is null
       and new.product_id is not null
       and coalesce(new.update_inventory, true) then
      perform public.inventory_apply_delta(new.business_id, new.product_id, new.quantity);
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_sync_inventory_trigger on public.expenses;
create trigger expenses_sync_inventory_trigger
  after insert or update on public.expenses
  for each row
  execute function public.expenses_sync_inventory();
