-- 1) Product names: unique only among active (non-archived) rows so archived SKUs
--    no longer block reusing the same display name.
-- 2) Sales: if a product has a BOM (product_components), deduct components only —
--    do not require sellable quantity on public.inventory for that product.
-- 3) archive_sale: restore component stock when archiving (was missing vs save_sale).

-- -----------------------------------------------------------------------------
-- products: partial unique index (active rows only)
-- -----------------------------------------------------------------------------
alter table public.products drop constraint if exists products_business_id_name_key;

drop index if exists products_business_id_name_active_uidx;

create unique index products_business_id_name_active_uidx
  on public.products (business_id, name)
  where deleted_at is null;

comment on index public.products_business_id_name_active_uidx is
  'One active product name per business; archived rows may reuse names.';

-- -----------------------------------------------------------------------------
-- save_sale: skip product ledger delta when BOM exists
-- -----------------------------------------------------------------------------
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
    notes
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

revoke all on function public.save_sale(date, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- update_sale: symmetric restore / apply
-- -----------------------------------------------------------------------------
create or replace function public.update_sale(
  p_sale_id uuid,
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

  -- Restore previous sale effects before rewriting.
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

revoke all on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- archive_sale: restore ledger only when no BOM; always restore components
-- -----------------------------------------------------------------------------
create or replace function public.archive_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r record;
  r_component record;
  v_component_delta numeric;
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

  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id and s.business_id = v_bid and s.deleted_at is null
  ) then
    raise exception 'Sale not found, already archived, or access denied';
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

  update public.sales
  set deleted_at = now()
  where id = p_sale_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Sale not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_sale(uuid) from public;
grant execute on function public.archive_sale(uuid) to authenticated;
