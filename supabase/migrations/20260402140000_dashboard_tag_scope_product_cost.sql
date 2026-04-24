-- When dashboard scope is a specific tag (p_sale_tag_id set), KPI "expense" side uses
-- product cost from sale lines (COGS) instead of tagged operating expenses.

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
  -- All tags: operating expenses. Single tag: COGS from sale_items for sales in that tag.
  counter_agg as (
    select * from (
      select
        coalesce(sum(e.total_amount), 0)::numeric(12, 2) as total_out,
        coalesce(sum(e.total_amount) filter (where e.payment_mode = 'cash'), 0)::numeric(12, 2) as cash_out,
        coalesce(sum(e.total_amount) filter (where e.payment_mode = 'online'), 0)::numeric(12, 2) as online_out
      from public.expenses e
      where e.business_id = v_bid
        and e.deleted_at is null
        and (e.date::date) >= p_from
        and (e.date::date) <= p_to
    ) x
    where p_sale_tag_id is null
    union all
    select * from (
      select
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)),
          0
        )::numeric(12, 2) as total_out,
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)) filter (where s.payment_mode = 'cash'),
          0
        )::numeric(12, 2) as cash_out,
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)) filter (where s.payment_mode = 'online'),
          0
        )::numeric(12, 2) as online_out
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where s.business_id = v_bid
        and s.deleted_at is null
        and s.date >= p_from
        and s.date <= p_to
        and s.sale_tag_id = p_sale_tag_id
    ) y
    where p_sale_tag_id is not null
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
    coalesce(ca.total_out, 0)::numeric(12, 2) as total_expenses,
    coalesce(iv.inventory_value, 0)::numeric(12, 2) as inventory_value,
    (coalesce(sa.total_revenue, 0) - coalesce(ca.total_out, 0))::numeric(12, 2) as gross_profit,
    (coalesce(sa.cash_sales, 0) - coalesce(ca.cash_out, 0))::numeric(12, 2) as net_cash,
    (coalesce(sa.online_sales, 0) - coalesce(ca.online_out, 0))::numeric(12, 2) as net_online,
    (
      (coalesce(sa.cash_sales, 0) - coalesce(ca.cash_out, 0))
      + (coalesce(sa.online_sales, 0) - coalesce(ca.online_out, 0))
    )::numeric(12, 2) as cash_in_hand_total,
    coalesce(sa.sales_count, 0)::bigint as sales_count,
    case
      when coalesce(sa.sales_count, 0) = 0 then 0::numeric(12, 2)
      else (coalesce(sa.total_revenue, 0) / coalesce(sa.sales_count, 0))::numeric(12, 2)
    end as average_sale_value
  from sales_agg sa
  cross join counter_agg ca
  cross join inv_val iv;
end;
$$;

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
  expense_monthly as (
    select
      date_trunc('month', (e.date::date)::timestamp)::date as month_start,
      sum(e.total_amount)::numeric(12, 2) as amt
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
      and (e.date::date) >= p_from
      and (e.date::date) <= p_to
      and p_sale_tag_id is null
    group by 1
  ),
  cogs_monthly as (
    select
      date_trunc('month', s.date::timestamp)::date as month_start,
      sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2))::numeric(12, 2) as amt
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and p_sale_tag_id is not null
      and s.sale_tag_id = p_sale_tag_id
    group by 1
  ),
  cost_or_expense_monthly as (
    select * from expense_monthly
    union all
    select * from cogs_monthly
  )
  select
    extract(month from ms.month_start)::int as month,
    extract(year from ms.month_start)::int as year,
    coalesce(sm.revenue, 0)::numeric(12, 2) as revenue,
    coalesce(ce.amt, 0)::numeric(12, 2) as expenses,
    (coalesce(sm.revenue, 0) - coalesce(ce.amt, 0))::numeric(12, 2) as profit
  from month_series ms
  left join sales_monthly sm on sm.month_start = ms.month_start
  left join cost_or_expense_monthly ce on ce.month_start = ms.month_start
  order by ms.month_start;
end;
$$;

select pg_notify('pgrst', 'reload schema');
