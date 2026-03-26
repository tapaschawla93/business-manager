-- UP: Foundation (soft delete, indexes, RLS), sales + sale_items, atomic save_sale RPC
-- Run in Supabase SQL Editor after prior migrations.

-- -----------------------------------------------------------------------------
-- 1) Foundation: deleted_at, updated_at, triggers, indexes
-- -----------------------------------------------------------------------------

alter table public.businesses
  add column if not exists deleted_at timestamptz;

alter table public.businesses
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.products
  add column if not exists deleted_at timestamptz;

create index if not exists products_business_id_idx on public.products (business_id);
-- profiles(business_id) already unique => indexed

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------------------------------
-- 2) current_business_id + onboarding only for active profiles
-- -----------------------------------------------------------------------------

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
  values (auth.uid(), v_business_id);

  return v_business_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) RLS: businesses + profiles + products (deleted_at IS NULL; no hard DELETE on products)
-- -----------------------------------------------------------------------------

drop policy if exists "Select own business" on public.businesses;
drop policy if exists "Update own business" on public.businesses;

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
  with check (business_id = public.current_business_id());

-- No DELETE policy — soft-delete only via UPDATE deleted_at

-- -----------------------------------------------------------------------------
-- 4) Sales header + line items (sale_items has NO deleted_at)
-- -----------------------------------------------------------------------------

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  date date not null,
  customer_name text not null,
  payment_mode text not null check (payment_mode in ('cash', 'online')),
  total_amount numeric(10, 2) not null default 0,
  total_cost numeric(10, 2) not null default 0,
  total_profit numeric(10, 2) not null default 0,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0),
  sale_price numeric(10, 2) not null check (sale_price >= 0),
  cost_price_snapshot numeric(10, 2) not null,
  mrp_snapshot numeric(10, 2) not null,
  vs_mrp numeric(10, 2) not null,
  profit numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_business_id_idx on public.sales (business_id);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at
before update on public.sales
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_sale_items_updated_at on public.sale_items;
create trigger set_sale_items_updated_at
before update on public.sale_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "sales_select_active" on public.sales;
drop policy if exists "sales_insert" on public.sales;
drop policy if exists "sales_update" on public.sales;

create policy "sales_select_active"
  on public.sales
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

-- Direct INSERT not granted by policy; use save_sale RPC (SECURITY DEFINER).
-- Soft-delete header via UPDATE:
create policy "sales_update"
  on public.sales
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (business_id = public.current_business_id());

drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select"
  on public.sale_items
  for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.business_id = public.current_business_id()
        and s.deleted_at is null
    )
  );

-- No INSERT/UPDATE/DELETE policies on sale_items for clients — only via save_sale RPC.

-- -----------------------------------------------------------------------------
-- 5) Atomic save_sale: reads product cost/mrp inside DB; computes snapshots + totals
-- -----------------------------------------------------------------------------

create or replace function public.save_sale(
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_sale_id uuid;
  v_elem jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_sale_price numeric;
  v_mrp numeric;
  v_cost numeric;
  v_vs_mrp numeric;
  v_line_profit numeric;
  v_total_amount numeric := 0;
  v_total_cost numeric := 0;
  v_line_rev numeric;
  v_line_cost numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('cash', 'online') then
    raise exception 'Invalid payment_mode';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'customer_name required';
  end if;

  insert into public.sales (
    business_id,
    date,
    customer_name,
    payment_mode,
    total_amount,
    total_cost,
    total_profit,
    notes
  ) values (
    v_bid,
    p_date,
    trim(p_customer_name),
    p_payment_mode,
    0,
    0,
    0,
    nullif(trim(p_notes), '')
  )
  returning id into v_sale_id;

  -- One JSON object per row: { "product_id", "quantity", "sale_price" }
  -- Alias element column explicitly — SELECT * uses "value", not "jsonb_array_elements", on many PG builds.
  for v_elem in
    select elem from jsonb_array_elements(p_lines) with ordinality as t(elem, _ord)
  loop
    v_product_id := (v_elem->>'product_id')::uuid;
    v_qty := (v_elem->>'quantity')::numeric;
    v_sale_price := (v_elem->>'sale_price')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity';
    end if;
    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'Invalid sale_price';
    end if;

    select p.mrp, p.cost_price into v_mrp, v_cost
    from public.products p
    where p.id = v_product_id
      and p.business_id = v_bid
      and p.deleted_at is null;

    if not found then
      raise exception 'Product not found or inactive';
    end if;

    v_vs_mrp := round((v_sale_price - v_mrp)::numeric, 2);
    v_line_profit := round(((v_sale_price - v_cost) * v_qty)::numeric, 2);
    v_line_rev := round((v_sale_price * v_qty)::numeric, 2);
    v_line_cost := round((v_cost * v_qty)::numeric, 2);

    v_total_amount := v_total_amount + v_line_rev;
    v_total_cost := v_total_cost + v_line_cost;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      sale_price,
      cost_price_snapshot,
      mrp_snapshot,
      vs_mrp,
      profit
    ) values (
      v_sale_id,
      v_product_id,
      v_qty,
      v_sale_price,
      v_cost,
      v_mrp,
      v_vs_mrp,
      v_line_profit
    );
  end loop;

  update public.sales
  set
    total_amount = round(v_total_amount, 2),
    total_cost = round(v_total_cost, 2),
    total_profit = round(v_total_amount - v_total_cost, 2)
  where id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total_amount', (select total_amount from public.sales where id = v_sale_id),
    'total_cost', (select total_cost from public.sales where id = v_sale_id),
    'total_profit', (select total_profit from public.sales where id = v_sale_id)
  );
end;
$$;

revoke all on function public.save_sale(date, text, text, text, jsonb) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb) to authenticated;

-- DOWN (manual): drop function save_sale; drop tables sale_items, sales; revert columns/policies as needed
