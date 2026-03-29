-- KPIs: inventory value from inventory_items (stock × unit cost); net cash / online from sales minus expenses by payment mode.
--
-- RETURNS TABLE column set changed vs 20260330140000 (cash_collected/online_collected → net_* / cash_in_hand_total).
-- Postgres does not allow CREATE OR REPLACE to change row type; drop signature first.

drop function if exists public.get_dashboard_kpis(date, date);

create or replace function public.get_dashboard_kpis(p_from date, p_to date)
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

revoke all on function public.get_dashboard_kpis(date, date) from public;
grant execute on function public.get_dashboard_kpis(date, date) to authenticated;
