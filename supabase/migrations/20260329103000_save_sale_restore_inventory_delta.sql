-- save_sale lost stock decrements when 20260327160000_v1_wrapup replaced the function.
-- Restore: decrement public.inventory per line via inventory_apply_delta so sales sync
-- with the ledger and (via inventory_pull_to_items) linked inventory_items rows.

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

revoke all on function public.save_sale(date, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb, text, text, text) to authenticated;
