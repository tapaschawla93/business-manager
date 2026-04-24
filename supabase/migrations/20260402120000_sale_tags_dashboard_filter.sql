-- Tenant sale_tags dictionary; sales.sale_tag_id + expenses.expense_tag_id; dashboard RPC optional filter.
-- Drops prior save_sale / update_sale / dashboard RPC signatures and replaces with tag-aware versions.

-- -----------------------------------------------------------------------------
-- 0) expenses_validate_refs: only validate product/vendor when they change on UPDATE
--     (otherwise expense_tag_id backfill fails for rows whose product was archived).
-- -----------------------------------------------------------------------------
create or replace function public.expenses_validate_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null then
    if tg_op = 'UPDATE' and old.product_id is not distinct from new.product_id then
      null;
    elsif not exists (
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
    if tg_op = 'UPDATE' and old.vendor_id is not distinct from new.vendor_id then
      null;
    elsif not exists (
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

-- -----------------------------------------------------------------------------
-- 1) sale_tags + FK columns (nullable until backfill)
-- -----------------------------------------------------------------------------
create table if not exists public.sale_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  label text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_tags_label_nonempty check (btrim(label) <> '')
);

create index if not exists sale_tags_business_id_idx on public.sale_tags (business_id);

create unique index if not exists sale_tags_business_label_active_uidx
  on public.sale_tags (business_id, lower(btrim(label)))
  where deleted_at is null;

drop trigger if exists set_sale_tags_updated_at on public.sale_tags;
create trigger set_sale_tags_updated_at
before update on public.sale_tags
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.businesses
  add column if not exists default_sale_tag_id uuid references public.sale_tags (id) on delete restrict;

alter table public.sales
  add column if not exists sale_tag_id uuid references public.sale_tags (id) on delete restrict;

alter table public.expenses
  add column if not exists expense_tag_id uuid references public.sale_tags (id) on delete restrict;

create index if not exists sales_sale_tag_id_idx on public.sales (sale_tag_id);
create index if not exists expenses_expense_tag_id_idx on public.expenses (expense_tag_id);

alter table public.sale_tags enable row level security;

drop policy if exists "sale_tags_select" on public.sale_tags;
drop policy if exists "sale_tags_insert" on public.sale_tags;
drop policy if exists "sale_tags_update" on public.sale_tags;

create policy "sale_tags_select"
  on public.sale_tags
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "sale_tags_insert"
  on public.sale_tags
  for insert
  with check (business_id = public.current_business_id());

create policy "sale_tags_update"
  on public.sale_tags
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

grant select, insert, update on public.sale_tags to authenticated;

comment on table public.sale_tags is
  'Tenant-scoped labels for tagging sales and expenses; dashboard can filter KPIs by tag.';
comment on column public.businesses.default_sale_tag_id is
  'Tag pre-selected in UI for new sales/expenses; not DB-enforced NOT NULL (insert timing).';
comment on column public.sales.sale_tag_id is
  'Required FK to sale_tags; classifies revenue for dashboard filters.';
comment on column public.expenses.expense_tag_id is
  'Required FK to sale_tags; classifies spend alongside sales tag on dashboard.';

-- -----------------------------------------------------------------------------
-- 2) Backfill one "General" tag per business + wire rows
-- -----------------------------------------------------------------------------
insert into public.sale_tags (business_id, label)
select b.id, 'General'
from public.businesses b
where b.deleted_at is null
  and not exists (
    select 1
    from public.sale_tags t
    where t.business_id = b.id
      and t.deleted_at is null
  );

update public.businesses b
set default_sale_tag_id = t.id
from public.sale_tags t
where t.business_id = b.id
  and t.deleted_at is null
  and lower(btrim(t.label)) = lower(btrim('General'))
  and b.default_sale_tag_id is null;

update public.sales s
set sale_tag_id = b.default_sale_tag_id
from public.businesses b
where s.business_id = b.id
  and s.sale_tag_id is null
  and b.default_sale_tag_id is not null;

update public.expenses e
set expense_tag_id = b.default_sale_tag_id
from public.businesses b
where e.business_id = b.id
  and e.expense_tag_id is null
  and b.default_sale_tag_id is not null;

alter table public.sales alter column sale_tag_id set not null;
alter table public.expenses alter column expense_tag_id set not null;

-- -----------------------------------------------------------------------------
-- 3) Drop old RPC signatures (avoid duplicate overloads)
-- -----------------------------------------------------------------------------
drop function if exists public.save_sale(date, text, text, text, jsonb, text, text, text);
drop function if exists public.update_sale(uuid, date, text, text, text, jsonb, text, text, text);
drop function if exists public.get_dashboard_kpis(date, date);
drop function if exists public.get_top_products(date, date);
drop function if exists public.get_monthly_performance(date, date);

-- -----------------------------------------------------------------------------
-- 4) save_sale / update_sale (V3 BOM + customer link + sale_tag_id)
-- -----------------------------------------------------------------------------
create or replace function public.save_sale(
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null,
  p_sale_tag_id uuid default null
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
  v_customer_phone text;
  v_customer_name text;
  v_customer_address text;
  v_customer_id uuid;
  r_component record;
  v_component_delta numeric;
  v_component_stock numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is null then
    raise exception 'sale_tag_id is required';
  end if;
  if not exists (
    select 1
    from public.sale_tags st
    where st.id = p_sale_tag_id
      and st.business_id = v_bid
      and st.deleted_at is null
  ) then
    raise exception 'Invalid sale tag';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('cash', 'online') then
    raise exception 'Invalid payment_mode';
  end if;

  if p_sale_type is not null and p_sale_type not in ('B2C', 'B2B', 'B2B2C') then
    raise exception 'Invalid sale_type';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_customer_name := coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), 'Customer');
  v_customer_address := nullif(trim(coalesce(p_customer_address, '')), '');

  if v_customer_phone is not null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.business_id = v_bid
      and c.phone = v_customer_phone
      and c.deleted_at is null
    limit 1;

    if v_customer_id is null then
      insert into public.customers (business_id, name, phone, address)
      values (v_bid, v_customer_name, v_customer_phone, v_customer_address)
      returning id into v_customer_id;
    else
      update public.customers
      set
        name = v_customer_name,
        address = coalesce(v_customer_address, address)
      where id = v_customer_id
        and business_id = v_bid;
    end if;
  end if;

  insert into public.sales (
    business_id,
    customer_id,
    date,
    customer_name,
    customer_phone,
    customer_address,
    sale_type,
    payment_mode,
    total_amount,
    total_cost,
    total_profit,
    notes,
    sale_tag_id
  ) values (
    v_bid,
    v_customer_id,
    p_date,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    v_customer_phone,
    v_customer_address,
    p_sale_type,
    p_payment_mode,
    0,
    0,
    0,
    nullif(trim(p_notes), ''),
    p_sale_tag_id
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

    if not exists (
      select 1 from public.product_components pc where pc.product_id = v_product_id
    ) then
      perform public.inventory_apply_delta(v_bid, v_product_id, -v_qty);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = v_product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * v_qty)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock - v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid
      returning current_stock into v_component_stock;

      if v_component_stock is null then
        raise exception 'Component inventory item not found for this business';
      end if;
      if v_component_stock < 0 then
        raise exception 'Insufficient component stock for this sale';
      end if;
    end loop;

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

revoke all on function public.save_sale(date, text, text, text, jsonb, text, text, text, uuid) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb, text, text, text, uuid) to authenticated;

create or replace function public.update_sale(
  p_sale_id uuid,
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null,
  p_sale_tag_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r record;
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
  v_customer_phone text;
  v_customer_name text;
  v_customer_address text;
  v_customer_id uuid;
  r_component record;
  v_component_delta numeric;
  v_component_stock numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is null then
    raise exception 'sale_tag_id is required';
  end if;
  if not exists (
    select 1
    from public.sale_tags st
    where st.id = p_sale_tag_id
      and st.business_id = v_bid
      and st.deleted_at is null
  ) then
    raise exception 'Invalid sale tag';
  end if;

  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id and s.business_id = v_bid and s.deleted_at is null
  ) then
    raise exception 'Sale not found, archived, or access denied';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('cash', 'online') then
    raise exception 'Invalid payment_mode';
  end if;

  if p_sale_type is not null and p_sale_type not in ('B2C', 'B2B', 'B2B2C') then
    raise exception 'Invalid sale_type';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  for r in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
  loop
    if not exists (
      select 1 from public.product_components pc where pc.product_id = r.product_id
    ) then
      perform public.inventory_apply_delta(v_bid, r.product_id, r.quantity);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = r.product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * r.quantity)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock + v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid;
    end loop;
  end loop;

  delete from public.sale_items where sale_id = p_sale_id;

  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_customer_name := coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), 'Customer');
  v_customer_address := nullif(trim(coalesce(p_customer_address, '')), '');
  v_customer_id := null;

  if v_customer_phone is not null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.business_id = v_bid
      and c.phone = v_customer_phone
      and c.deleted_at is null
    limit 1;

    if v_customer_id is null then
      insert into public.customers (business_id, name, phone, address)
      values (v_bid, v_customer_name, v_customer_phone, v_customer_address)
      returning id into v_customer_id;
    else
      update public.customers
      set
        name = v_customer_name,
        address = coalesce(v_customer_address, address)
      where id = v_customer_id
        and business_id = v_bid;
    end if;
  end if;

  update public.sales
  set
    customer_id = v_customer_id,
    date = p_date,
    customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone = v_customer_phone,
    customer_address = v_customer_address,
    sale_type = p_sale_type,
    payment_mode = p_payment_mode,
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    sale_tag_id = p_sale_tag_id,
    total_amount = 0,
    total_cost = 0,
    total_profit = 0
  where id = p_sale_id
    and business_id = v_bid;

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

    if not exists (
      select 1 from public.product_components pc where pc.product_id = v_product_id
    ) then
      perform public.inventory_apply_delta(v_bid, v_product_id, -v_qty);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = v_product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * v_qty)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock - v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid
      returning current_stock into v_component_stock;

      if v_component_stock is null then
        raise exception 'Component inventory item not found for this business';
      end if;
      if v_component_stock < 0 then
        raise exception 'Insufficient component stock for this sale';
      end if;
    end loop;

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
      p_sale_id,
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
  where id = p_sale_id
    and business_id = v_bid;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'total_amount', (select total_amount from public.sales where id = p_sale_id),
    'total_cost', (select total_cost from public.sales where id = p_sale_id),
    'total_profit', (select total_profit from public.sales where id = p_sale_id)
  );
end;
$$;

revoke all on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text, uuid) from public;
grant execute on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Dashboard RPCs: optional p_sale_tag_id (inventory_value stays tenant-wide)
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_kpis(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
returns table (
  total_revenue numeric(12, 2),
  total_expenses numeric(12, 2),
  inventory_value numeric(12, 2),
  gross_profit numeric(12, 2),
  net_cash numeric(12, 2),
  net_online numeric(12, 2),
  cash_in_hand_total numeric(12, 2),
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

  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;

  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  return query
  with
  sales_agg as (
    select
      sum(s.total_amount)::numeric(12, 2) as total_revenue,
      sum(s.total_amount) filter (where s.payment_mode = 'cash')::numeric(12, 2) as cash_sales,
      sum(s.total_amount) filter (where s.payment_mode = 'online')::numeric(12, 2) as online_sales,
      count(s.id)::bigint as sales_count
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
  ),
  expenses_agg as (
    select
      sum(e.total_amount)::numeric(12, 2) as total_expenses,
      sum(e.total_amount) filter (where e.payment_mode = 'cash')::numeric(12, 2) as cash_expenses,
      sum(e.total_amount) filter (where e.payment_mode = 'online')::numeric(12, 2) as online_expenses
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
      and (e.date::date) >= p_from
      and (e.date::date) <= p_to
      and (p_sale_tag_id is null or e.expense_tag_id = p_sale_tag_id)
  ),
  inv_val as (
    select
      coalesce(
        sum(round((ii.current_stock * ii.unit_cost)::numeric, 2)),
        0
      )::numeric(12, 2) as inventory_value
    from public.inventory_items ii
    where ii.business_id = v_bid
  )
  select
    coalesce(sa.total_revenue, 0)::numeric(12, 2) as total_revenue,
    coalesce(ea.total_expenses, 0)::numeric(12, 2) as total_expenses,
    coalesce(iv.inventory_value, 0)::numeric(12, 2) as inventory_value,
    (coalesce(sa.total_revenue, 0) - coalesce(ea.total_expenses, 0))::numeric(12, 2) as gross_profit,
    (coalesce(sa.cash_sales, 0) - coalesce(ea.cash_expenses, 0))::numeric(12, 2) as net_cash,
    (coalesce(sa.online_sales, 0) - coalesce(ea.online_expenses, 0))::numeric(12, 2) as net_online,
    (
      (coalesce(sa.cash_sales, 0) - coalesce(ea.cash_expenses, 0))
      + (coalesce(sa.online_sales, 0) - coalesce(ea.online_expenses, 0))
    )::numeric(12, 2) as cash_in_hand_total,
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

revoke all on function public.get_dashboard_kpis(date, date, uuid) from public;
grant execute on function public.get_dashboard_kpis(date, date, uuid) to authenticated;

create or replace function public.get_top_products(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
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

  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;

  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  return (
    with
    line_base as (
      select
        si.product_id,
        si.quantity,
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
        and s.date >= p_from
        and s.date <= p_to
        and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
    ),
    product_aggs as (
      select
        p.id as product_id,
        p.name as product_name,
        p.variant as product_variant,
        sum(lb.line_revenue)::numeric(12, 2) as revenue,
        sum(lb.quantity)::numeric(12, 3) as quantity_sold,
        avg(lb.line_margin_pct) filter (where lb.line_margin_pct is not null)::numeric(12, 2) as avg_margin_pct
      from line_base lb
      join public.products p
        on p.id = lb.product_id
      where p.deleted_at is null
        and p.business_id = v_bid
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
    ),
    top_vol as (
      select *
      from product_aggs
      order by quantity_sold desc nulls last
      limit 5
    ),
    category_agg as (
      select
        p.category,
        sum(si.sale_price * si.quantity)::numeric(12, 2) as revenue
      from public.sale_items si
      join public.sales s
        on s.id = si.sale_id
      join public.products p
        on p.id = si.product_id
      where s.business_id = v_bid
        and s.deleted_at is null
        and s.date >= p_from
        and s.date <= p_to
        and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
        and p.deleted_at is null
        and p.business_id = v_bid
      group by p.category
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
        ),
      'top_by_volume',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tv.product_id,
                'label',
                  case
                    when tv.product_variant is null or btrim(tv.product_variant) = '' then tv.product_name
                    else tv.product_name || ' — ' || tv.product_variant
                  end,
                'quantity_sold', round(tv.quantity_sold, 3),
                'revenue', round(tv.revenue, 2)
              )
            )
            from top_vol tv
          ),
          '[]'::jsonb
        ),
      'sales_by_category',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('category', ca.category, 'revenue', round(ca.revenue, 2))
              order by ca.revenue desc nulls last
            )
            from category_agg ca
          ),
          '[]'::jsonb
        )
    ));
end;
$$;

revoke all on function public.get_top_products(date, date, uuid) from public;
grant execute on function public.get_top_products(date, date, uuid) to authenticated;

create or replace function public.get_monthly_performance(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
returns table (
  month int,
  year int,
  revenue numeric(12, 2),
  expenses numeric(12, 2),
  profit numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_start_month date;
  v_end_month date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;
  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  v_start_month := date_trunc('month', p_from)::date;
  v_end_month := date_trunc('month', p_to)::date;

  return query
  with month_series as (
    select generate_series(v_start_month::timestamp, v_end_month::timestamp, interval '1 month')::date as month_start
  ),
  sales_monthly as (
    select
      date_trunc('month', s.date::timestamp)::date as month_start,
      sum(s.total_amount)::numeric(12, 2) as revenue
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
    group by 1
  ),
  expenses_monthly as (
    select
      date_trunc('month', (e.date::date)::timestamp)::date as month_start,
      sum(e.total_amount)::numeric(12, 2) as expenses
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
      and (e.date::date) >= p_from
      and (e.date::date) <= p_to
      and (p_sale_tag_id is null or e.expense_tag_id = p_sale_tag_id)
    group by 1
  )
  select
    extract(month from ms.month_start)::int as month,
    extract(year from ms.month_start)::int as year,
    coalesce(sm.revenue, 0)::numeric(12, 2) as revenue,
    coalesce(em.expenses, 0)::numeric(12, 2) as expenses,
    (coalesce(sm.revenue, 0) - coalesce(em.expenses, 0))::numeric(12, 2) as profit
  from month_series ms
  left join sales_monthly sm on sm.month_start = ms.month_start
  left join expenses_monthly em on em.month_start = ms.month_start
  order by ms.month_start;
end;
$$;

revoke all on function public.get_monthly_performance(date, date, uuid) from public;
grant execute on function public.get_monthly_performance(date, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6) New businesses: seed General tag + default pointer
-- -----------------------------------------------------------------------------
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
  v_tag_id uuid;
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

  insert into public.sale_tags (business_id, label)
  values (v_business_id, 'General')
  returning id into v_tag_id;

  update public.businesses
  set default_sale_tag_id = v_tag_id
  where id = v_business_id;

  insert into public.profiles (id, business_id)
  values (auth.uid(), v_business_id);

  return v_business_id;
end;
$$;

revoke all on function public.create_business_for_user(text) from public;
grant execute on function public.create_business_for_user(text) to authenticated;

-- PostgREST: pick up new/changed RPC signatures.
select pg_notify('pgrst', 'reload schema');
