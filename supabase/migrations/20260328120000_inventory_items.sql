-- Manual inventory lines (prd.v2.4.3) + bidirectional qty sync with public.inventory
-- when product_id is set (sales/expense triggers keep updating public.inventory).
-- Ensures public.inventory exists (idempotent) for tenants that skipped 20260326120000.

-- -----------------------------------------------------------------------------
-- 0) Ledger table (required for FK + triggers; no-op if already present)
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

-- -----------------------------------------------------------------------------
-- 1) inventory_items
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  unit text not null default 'pcs',
  current_stock numeric(12, 3) not null default 0 check (current_stock >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  reorder_level numeric(12, 3),
  product_id uuid references public.products (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_business_id_idx on public.inventory_items (business_id);
create index if not exists inventory_items_product_id_idx on public.inventory_items (product_id);

-- At most one inventory_item per (business, product) when linked
create unique index if not exists inventory_items_business_product_uidx
  on public.inventory_items (business_id, product_id)
  where product_id is not null;

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.inventory_items enable row level security;

drop policy if exists "inventory_items_select" on public.inventory_items;
drop policy if exists "inventory_items_insert" on public.inventory_items;
drop policy if exists "inventory_items_update" on public.inventory_items;
drop policy if exists "inventory_items_delete" on public.inventory_items;

create policy "inventory_items_select"
  on public.inventory_items
  for select
  using (business_id = public.current_business_id());

create policy "inventory_items_insert"
  on public.inventory_items
  for insert
  with check (business_id = public.current_business_id());

create policy "inventory_items_update"
  on public.inventory_items
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "inventory_items_delete"
  on public.inventory_items
  for delete
  using (business_id = public.current_business_id());

-- -----------------------------------------------------------------------------
-- 2) Push inventory_items.current_stock → public.inventory (when product_id set)
-- -----------------------------------------------------------------------------
create or replace function public.inventory_items_push_to_ledger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  insert into public.inventory (product_id, business_id, quantity_on_hand)
  values (new.product_id, new.business_id, new.current_stock)
  on conflict (product_id) do update
  set
    quantity_on_hand = excluded.quantity_on_hand,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists inventory_items_push_to_ledger_trigger on public.inventory_items;
create trigger inventory_items_push_to_ledger_trigger
after insert or update of current_stock, product_id, business_id on public.inventory_items
for each row
execute function public.inventory_items_push_to_ledger();

-- -----------------------------------------------------------------------------
-- 3) Pull public.inventory.quantity_on_hand → inventory_items (sales / expenses)
-- -----------------------------------------------------------------------------
create or replace function public.inventory_pull_to_items()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.inventory_items ii
  set
    current_stock = new.quantity_on_hand,
    updated_at = now()
  where ii.business_id = new.business_id
    and ii.product_id = new.product_id
    and ii.current_stock is distinct from new.quantity_on_hand;

  return new;
end;
$$;

drop trigger if exists inventory_pull_to_items_trigger on public.inventory;
create trigger inventory_pull_to_items_trigger
after update of quantity_on_hand on public.inventory
for each row
execute function public.inventory_pull_to_items();
