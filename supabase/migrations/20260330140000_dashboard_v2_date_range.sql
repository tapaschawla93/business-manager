-- Dashboard v2: date-scoped KPIs, payment split (cash vs online), top by volume,
-- sales by category (non-deleted products). Replaces zero-arg RPC signatures.

-- -----------------------------------------------------------------------------
-- get_dashboard_kpis(p_from, p_to)
-- -----------------------------------------------------------------------------
drop function if exists public.get_dashboard_kpis();

create or replace function public.get_dashboard_kpis(p_from date, p_to date)
returns table (
  total_revenue numeric(12, 2),
  total_expenses numeric(12, 2),
  inventory_value numeric(12, 2),
  gross_profit numeric(12, 2),
  cash_collected numeric(12, 2),
  online_collected numeric(12, 2),
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

  return query
  with
  sales_agg as (
    select
      sum(s.total_amount)::numeric(12, 2) as total_revenue,
      sum(s.total_amount) filter (where s.payment_mode = 'cash')::numeric(12, 2) as cash_collected,
      sum(s.total_amount) filter (where s.payment_mode = 'online')::numeric(12, 2) as online_collected,
      count(s.id)::bigint as sales_count
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
  ),
  expenses_agg as (
    select
      sum(e.total_amount)::numeric(12, 2) as total_expenses
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
      and (e.date::date) >= p_from
      and (e.date::date) <= p_to
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
    coalesce(sa.cash_collected, 0)::numeric(12, 2) as cash_collected,
    coalesce(sa.online_collected, 0)::numeric(12, 2) as online_collected,
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

revoke all on function public.get_dashboard_kpis(date, date) from public;
grant execute on function public.get_dashboard_kpis(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- get_top_products(p_from, p_to) — adds top_by_volume + sales_by_category;
-- active (non-deleted) products only for product-level lists.
-- -----------------------------------------------------------------------------
drop function if exists public.get_top_products();

create or replace function public.get_top_products(p_from date, p_to date)
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

revoke all on function public.get_top_products(date, date) from public;
grant execute on function public.get_top_products(date, date) to authenticated;
