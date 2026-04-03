-- Assembly SKUs: stock is deducted from inventory_items via product_components.
-- If migration 20260402100000 was not applied, older save_sale still calls
-- inventory_apply_delta(-qty) and fails when product ledger is empty.
-- This no-op for negative deltas when a BOM exists makes sales succeed regardless.

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
  if p_delta is null then
    raise exception 'inventory_apply_delta: delta required';
  end if;
  if p_delta = 0 then
    return;
  end if;

  if p_delta < 0 then
    if exists (
      select 1 from public.product_components pc where pc.product_id = p_product_id
    ) then
      return;
    end if;
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
