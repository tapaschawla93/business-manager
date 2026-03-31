-- Backfill customers from legacy sales (phone present, customer_id null).
-- Fix inventory_apply_delta: validate projected qty before UPDATE so CHECK fails are replaced
-- by a clear "Insufficient stock" error (avoids inventory_quantity_on_hand_check on UPDATE).

-- -----------------------------------------------------------------------------
-- Backfill: customers + sales.customer_id
-- -----------------------------------------------------------------------------
insert into public.customers (business_id, name, phone, address)
select distinct on (s.business_id, nullif(trim(s.customer_phone), ''))
  s.business_id,
  coalesce(nullif(trim(s.customer_name), ''), 'Customer'),
  nullif(trim(s.customer_phone), ''),
  nullif(trim(s.customer_address), '')
from public.sales s
where s.deleted_at is null
  and s.customer_id is null
  and nullif(trim(s.customer_phone), '') is not null
  and not exists (
    select 1
    from public.customers c
    where c.business_id = s.business_id
      and c.phone = nullif(trim(s.customer_phone), '')
      and c.deleted_at is null
  )
order by s.business_id, nullif(trim(s.customer_phone), ''), s.created_at desc;

update public.sales s
set customer_id = c.id
from public.customers c
where s.deleted_at is null
  and s.customer_id is null
  and c.deleted_at is null
  and c.business_id = s.business_id
  and c.phone = nullif(trim(s.customer_phone), '');

-- -----------------------------------------------------------------------------
-- inventory_apply_delta: check stock before writing (no negative intermediate)
-- -----------------------------------------------------------------------------
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
  v_current numeric;
  v_new numeric;
begin
  if p_business_id is null or p_product_id is null then
    raise exception 'inventory_apply_delta: business_id and product_id required';
  end if;
  /* Treat NULL delta as no-op (same as callers passing explicit NULL) */
  if p_delta is null then
    raise exception 'inventory_apply_delta: delta required';
  end if;
  if p_delta = 0 then
    return;
  end if;

  insert into public.inventory (business_id, product_id, quantity_on_hand)
  values (p_business_id, p_product_id, 0)
  on conflict (product_id) do nothing;

  select quantity_on_hand
  into v_current
  from public.inventory
  where product_id = p_product_id
    and business_id = p_business_id
  for update;

  if v_current is null then
    raise exception 'inventory_apply_delta: ledger row missing after upsert';
  end if;

  v_new := round((v_current + p_delta)::numeric, 3);

  if v_new < 0 then
    raise exception 'Insufficient stock for this sale (inventory would go negative).';
  end if;

  update public.inventory
  set
    quantity_on_hand = v_new,
    updated_at = now()
  where product_id = p_product_id
    and business_id = p_business_id;
end;
$$;

revoke all on function public.inventory_apply_delta(uuid, uuid, numeric) from public;
