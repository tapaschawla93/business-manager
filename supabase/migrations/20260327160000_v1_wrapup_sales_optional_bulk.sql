-- V1 wrap-up:
-- - sales customer fields optional (name/phone/address)
-- - optional sale_type (B2C/B2B/B2B2C)
-- - save_sale accepts optional customer fields + sale_type

alter table public.sales
  alter column customer_name drop not null;

alter table public.sales
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists sale_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_sale_type_check'
  ) then
    alter table public.sales
      add constraint sales_sale_type_check
      check (sale_type is null or sale_type in ('B2C', 'B2B', 'B2B2C'));
  end if;
end $$;

drop function if exists public.save_sale(date, text, text, text, jsonb);

create or replace function public.save_sale(
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null
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

  if p_sale_type is not null and p_sale_type not in ('B2C', 'B2B', 'B2B2C') then
    raise exception 'Invalid sale_type';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  insert into public.sales (
    business_id,
    date,
    customer_name,
    customer_phone,
    customer_address,
    sale_type,
    payment_mode,
    total_amount,
    total_cost,
    total_profit,
    notes
  ) values (
    v_bid,
    p_date,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_customer_address, '')), ''),
    p_sale_type,
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

revoke all on function public.save_sale(date, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb, text, text, text) to authenticated;

