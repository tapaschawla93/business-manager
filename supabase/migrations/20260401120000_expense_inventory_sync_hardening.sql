-- Harden stock-in from expenses:
-- 1) inventory_pull_to_items: use EXISTS instead of ROW_COUNT (avoids edge cases where ROW_COUNT was 0 after UPDATE).
-- 2) expenses_sync_inventory: SECURITY DEFINER so the trigger reliably runs inventory_apply_delta under RLS.
-- 3) reconcile_inventory_line_for_product: app-callable mirror of ledger → inventory_items (belt-and-suspenders after save).

create or replace function public.inventory_pull_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_cost numeric(12, 2);
begin
  if exists (
    select 1
    from public.inventory_items ii
    where
      ii.business_id = new.business_id
      and ii.product_id = new.product_id
  ) then
    update public.inventory_items ii
    set
      current_stock = new.quantity_on_hand,
      updated_at = now()
    where
      ii.business_id = new.business_id
      and ii.product_id = new.product_id;
  else
    select
      case
        when coalesce(trim(p.variant), '') = '' then trim(p.name)
        else trim(p.name) || ' · ' || trim(p.variant)
      end,
      coalesce(p.cost_price, 0::numeric)::numeric(12, 2)
    into v_name, v_cost
    from public.products p
    where
      p.id = new.product_id
      and p.business_id = new.business_id
      and p.deleted_at is null;

    if v_name is not null then
      insert into public.inventory_items (
        business_id,
        name,
        unit,
        current_stock,
        unit_cost,
        reorder_level,
        product_id
      )
      values (
        new.business_id,
        v_name,
        'pcs',
        new.quantity_on_hand,
        v_cost,
        null,
        new.product_id
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.expenses_sync_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    if new.deleted_at is null
       and new.product_id is not null
       and coalesce(new.update_inventory, true) then
      perform public.inventory_apply_delta(new.business_id, new.product_id, new.quantity);
    end if;
    return new;
  elsif tg_op = 'update' then
    if old.deleted_at is null
       and old.product_id is not null
       and coalesce(old.update_inventory, true) then
      perform public.inventory_apply_delta(old.business_id, old.product_id, -old.quantity);
    end if;
    if new.deleted_at is null
       and new.product_id is not null
       and coalesce(new.update_inventory, true) then
      perform public.inventory_apply_delta(new.business_id, new.product_id, new.quantity);
    end if;
    return new;
  end if;
  return new;
end;
$$;

create or replace function public.reconcile_inventory_line_for_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_qty numeric(12, 3);
  v_name text;
  v_cost numeric(12, 2);
begin
  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business profile';
  end if;

  if not exists (
    select 1
    from public.products p
    where
      p.id = p_product_id
      and p.business_id = v_bid
      and p.deleted_at is null
  ) then
    raise exception 'Product not found for this business';
  end if;

  select i.quantity_on_hand
  into v_qty
  from public.inventory i
  where
    i.product_id = p_product_id
    and i.business_id = v_bid;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.inventory_items ii
    where
      ii.business_id = v_bid
      and ii.product_id = p_product_id
  ) then
    update public.inventory_items ii
    set
      current_stock = v_qty,
      updated_at = now()
    where
      ii.business_id = v_bid
      and ii.product_id = p_product_id;
  else
    select
      case
        when coalesce(trim(p.variant), '') = '' then trim(p.name)
        else trim(p.name) || ' · ' || trim(p.variant)
      end,
      coalesce(p.cost_price, 0::numeric)::numeric(12, 2)
    into v_name, v_cost
    from public.products p
    where
      p.id = p_product_id
      and p.business_id = v_bid
      and p.deleted_at is null;

    if v_name is null then
      return;
    end if;

    insert into public.inventory_items (
      business_id,
      name,
      unit,
      current_stock,
      unit_cost,
      reorder_level,
      product_id
    )
    values (
      v_bid,
      v_name,
      'pcs',
      v_qty,
      v_cost,
      null,
      p_product_id
    );
  end if;
end;
$$;

revoke all on function public.reconcile_inventory_line_for_product(uuid) from public;
grant execute on function public.reconcile_inventory_line_for_product(uuid) to authenticated;
