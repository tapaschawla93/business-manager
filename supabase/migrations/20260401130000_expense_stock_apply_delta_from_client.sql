-- Stock-in on NEW expenses: apply ledger delta from the app right after insert succeeds.
-- The AFTER INSERT trigger path is skipped so we never depend on trigger/PostgREST edge cases;
-- UPDATE/soft-delete paths stay on the trigger (reversal + re-apply).

create or replace function public.inventory_apply_delta_for_tenant(
  p_business_id uuid,
  p_product_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is distinct from public.current_business_id() then
    raise exception 'Business mismatch';
  end if;
  if p_product_id is null or p_delta is null then
    raise exception 'product_id and delta required';
  end if;
  if p_delta = 0 then
    return;
  end if;
  perform public.inventory_apply_delta(p_business_id, p_product_id, p_delta);
end;
$$;

revoke all on function public.inventory_apply_delta_for_tenant(uuid, uuid, numeric) from public;
grant execute on function public.inventory_apply_delta_for_tenant(uuid, uuid, numeric) to authenticated;

create or replace function public.expenses_sync_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    -- Applied from app via inventory_apply_delta_for_tenant after insert (reliable with anon key).
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
