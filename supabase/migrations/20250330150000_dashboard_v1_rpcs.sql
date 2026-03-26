-- Dashboard V1 RPCs (read-only)
-- - get_dashboard_kpis(): top KPI aggregates (all-time)
-- - get_top_products(): top 5 products by revenue + by average margin %

-- -----------------------------------------------------------------------------
-- 1) get_dashboard_kpis()
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

-- -----------------------------------------------------------------------------
-- 2) get_top_products()
-- -----------------------------------------------------------------------------
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

