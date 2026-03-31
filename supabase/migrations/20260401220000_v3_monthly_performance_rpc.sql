-- V3 dashboard chart data: monthly revenue / expenses / profit (zero-filled months).

create or replace function public.get_monthly_performance(
  p_from date,
  p_to date
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

revoke all on function public.get_monthly_performance(date, date) from public;
grant execute on function public.get_monthly_performance(date, date) to authenticated;
