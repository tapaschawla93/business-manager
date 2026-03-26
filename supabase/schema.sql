-- Supabase schema: tenancy, products (soft delete), sales, atomic save_sale RPC.
-- For existing DBs, prefer applying migrations in order (see supabase/migrations/).

-- -----------------------------------------------------------------------------
-- Shared trigger: bump updated_at on UPDATE
-- -----------------------------------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- 1) Businesses
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  full_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_business_id_key unique (business_id)
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers
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

revoke all on function public.create_business_for_user(text) from public;
grant execute on function public.create_business_for_user(text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: businesses + profiles
-- -----------------------------------------------------------------------------
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
-- 3) Products
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

-- WITH CHECK: invoker-safe tenant match (do not require deleted_at IS NULL on new row).
-- Do not use RETURNING/select after archive — SELECT policies hide archived rows.
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
        and p.business_id = business_id
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Sales + sale_items
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

-- -----------------------------------------------------------------------------
-- 5) Expenses (soft delete; no DELETE policy)
-- -----------------------------------------------------------------------------
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

create index if not exists expenses_business_id_idx on public.expenses (business_id);

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
        and p.business_id = business_id
    )
  );

-- -----------------------------------------------------------------------------
-- save_sale RPC (see migration file for full body; duplicated here for greenfield)
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

revoke all on function public.save_sale(date, text, text, text, jsonb) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Archive RPCs (SECURITY DEFINER — tenant check via profiles, then UPDATE bypasses RLS)
-- -----------------------------------------------------------------------------
create or replace function public.archive_product(p_product_id uuid)
returns void
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

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  update public.products
  set deleted_at = now()
  where id = p_product_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Product not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_product(uuid) from public;
grant execute on function public.archive_product(uuid) to authenticated;

create or replace function public.archive_expense(p_expense_id uuid)
returns void
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

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  update public.expenses
  set deleted_at = now()
  where id = p_expense_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_expense(uuid) from public;
grant execute on function public.archive_expense(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Dashboard V1 RPCs (read-only)
-- -----------------------------------------------------------------------------

create or replace function public.get_dashboard_kpis()
returns table (
  total_revenue numeric(12, 2),
  total_expenses numeric(12, 2),
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
  )
  select
    coalesce(sa.total_revenue, 0)::numeric(12, 2) as total_revenue,
    coalesce(ea.total_expenses, 0)::numeric(12, 2) as total_expenses,
    (coalesce(sa.total_revenue, 0) - coalesce(ea.total_expenses, 0))::numeric(12, 2) as gross_profit,
    -- Cash in hand = (cash + online sales) - (cash + online expenses) = Revenue - Expenses
    (coalesce(sa.total_revenue, 0) - coalesce(ea.total_expenses, 0))::numeric(12, 2) as cash_in_hand,
    coalesce(sa.online_received, 0)::numeric(12, 2) as online_received,
    coalesce(sa.sales_count, 0)::bigint as sales_count,
    case
      when coalesce(sa.sales_count, 0) = 0 then 0::numeric(12, 2)
      else (coalesce(sa.total_revenue, 0) / coalesce(sa.sales_count, 0))::numeric(12, 2)
    end as average_sale_value
  from sales_agg sa
  cross join expenses_agg ea;
end;
$$;

revoke all on function public.get_dashboard_kpis() from public;
grant execute on function public.get_dashboard_kpis() to authenticated;

create or replace function public.get_top_products()
returns jsonb
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

  return (
    with
    line_base as (
      select
        si.product_id,
        (si.sale_price * si.quantity)::numeric(12, 2) as line_revenue,
        case
          when si.cost_price_snapshot > 0 then
            (((si.sale_price - si.cost_price_snapshot) / si.cost_price_snapshot) * 100)::numeric(12, 2)
          else null
        end as line_margin_pct
      from public.sale_items si
      join public.sales s
        on s.id = si.sale_id
      where s.business_id = v_bid
        and s.deleted_at is null
    ),
    product_aggs as (
      select
        p.id as product_id,
        p.name as product_name,
        p.variant as product_variant,
        sum(lb.line_revenue)::numeric(12, 2) as revenue,
        avg(lb.line_margin_pct) filter (where lb.line_margin_pct is not null)::numeric(12, 2) as avg_margin_pct
      from line_base lb
      join public.products p
        on p.id = lb.product_id
      group by p.id, p.name, p.variant
    ),
    top_rev as (
      select *
      from product_aggs
      order by revenue desc nulls last
      limit 5
    ),
    top_margin as (
      select *
      from product_aggs
      where avg_margin_pct is not null
      order by avg_margin_pct desc nulls last
      limit 5
    )
    select jsonb_build_object(
      'top_by_revenue',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tr.product_id,
                'label',
                  case
                    when tr.product_variant is null or btrim(tr.product_variant) = '' then tr.product_name
                    else tr.product_name || ' — ' || tr.product_variant
                  end,
                'revenue', round(tr.revenue, 2),
                'avg_margin_pct',
                  case when tr.avg_margin_pct is null then null else round(tr.avg_margin_pct, 2) end
              )
            )
            from top_rev tr
          ),
          '[]'::jsonb
        ),
      'top_by_margin',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tm.product_id,
                'label',
                  case
                    when tm.product_variant is null or btrim(tm.product_variant) = '' then tm.product_name
                    else tm.product_name || ' — ' || tm.product_variant
                  end,
                'revenue', round(tm.revenue, 2),
                'avg_margin_pct', round(tm.avg_margin_pct, 2)
              )
            )
            from top_margin tm
          ),
          '[]'::jsonb
        )
    ));
end;
$$;

revoke all on function public.get_top_products() from public;
grant execute on function public.get_top_products() to authenticated;
