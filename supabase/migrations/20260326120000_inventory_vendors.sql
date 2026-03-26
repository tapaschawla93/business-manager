-- Inventory (per product), vendors, expense links; stock moves on expenses + sales; dashboard inventory value.

-- -----------------------------------------------------------------------------
-- 1) Vendors
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
-- 2) Inventory (one row per product when non-zero or after first movement)
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
-- 3) Expenses: optional product (stock in) + vendor link
-- -----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists product_id uuid references public.products (id) on delete restrict;

alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;

create index if not exists expenses_product_id_idx on public.expenses (product_id);
create index if not exists expenses_vendor_id_idx on public.expenses (vendor_id);

-- -----------------------------------------------------------------------------
-- 4) Delta helper (SECURITY DEFINER — used by triggers + save_sale)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5) Expense validation + stock from purchases
-- -----------------------------------------------------------------------------
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
    if new.deleted_at is null and new.product_id is not null then
      perform public.inventory_apply_delta(new.business_id, new.product_id, new.quantity);
    end if;
    return new;
  elsif tg_op = 'update' then
    if old.deleted_at is null and old.product_id is not null then
      perform public.inventory_apply_delta(old.business_id, old.product_id, -old.quantity);
    end if;
    if new.deleted_at is null and new.product_id is not null then
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

-- -----------------------------------------------------------------------------
-- 6) save_sale: decrement stock per line (fail sale if insufficient)
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

  for v_elem in
    select elem from jsonb_array_elements(p_lines) with ordinality as t(elem, _ignore_ord)
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

    perform public.inventory_apply_delta(v_bid, v_product_id, -v_qty);

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
  where id = v_sale_id
    and business_id = v_bid;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total_amount', (select total_amount from public.sales where id = v_sale_id),
    'total_cost', (select total_cost from public.sales where id = v_sale_id),
    'total_profit', (select total_profit from public.sales where id = v_sale_id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Dashboard KPIs: inventory value at catalog cost
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_kpis()
returns table (
  total_revenue numeric(12, 2),
  total_expenses numeric(12, 2),
  inventory_value numeric(12, 2),
  gross_profit numeric(12, 2),
  cash_in_hand numeric(12, 2),
  online_received numeric(12, 2),
  sales_count bigint,
  average_sale_value numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  return query
  with
  sales_agg as (
    select
      sum(s.total_amount)::numeric(12, 2) as total_revenue,
      sum(s.total_amount) filter (where s.payment_mode = 'cash')::numeric(12, 2) as cash_sales,
      sum(s.total_amount) filter (where s.payment_mode = 'online')::numeric(12, 2) as online_received,
      count(s.id)::bigint as sales_count
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
  ),
  expenses_agg as (
    select
      sum(e.total_amount)::numeric(12, 2) as total_expenses,
      sum(e.total_amount) filter (where e.payment_mode = 'cash')::numeric(12, 2) as cash_expenses
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
  ),
  inv_val as (
    select
      coalesce(
        sum(
          round((i.quantity_on_hand * p.cost_price)::numeric, 2)
        ),
        0
      )::numeric(12, 2) as inventory_value
    from public.inventory i
    join public.products p
      on p.id = i.product_id
    where i.business_id = v_bid
      and p.business_id = v_bid
      and p.deleted_at is null
  )
  select
    coalesce(sa.total_revenue, 0)::numeric(12, 2) as total_revenue,
    coalesce(ea.total_expenses, 0)::numeric(12, 2) as total_expenses,
    coalesce(iv.inventory_value, 0)::numeric(12, 2) as inventory_value,
    (coalesce(sa.total_revenue, 0) - coalesce(ea.total_expenses, 0))::numeric(12, 2) as gross_profit,
    (coalesce(sa.total_revenue, 0) - coalesce(ea.total_expenses, 0))::numeric(12, 2) as cash_in_hand,
    coalesce(sa.online_received, 0)::numeric(12, 2) as online_received,
    coalesce(sa.sales_count, 0)::bigint as sales_count,
    case
      when coalesce(sa.sales_count, 0) = 0 then 0::numeric(12, 2)
      else (coalesce(sa.total_revenue, 0) / coalesce(sa.sales_count, 0))::numeric(12, 2)
    end as average_sale_value
  from sales_agg sa
  cross join expenses_agg ea
  cross join inv_val iv;
end;
$$;

revoke all on function public.get_dashboard_kpis() from public;
grant execute on function public.get_dashboard_kpis() to authenticated;
