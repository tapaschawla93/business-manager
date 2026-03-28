-- inventory_pull_to_items / inventory_items_push_to_ledger run after updates from
-- inventory_apply_delta (SECURITY DEFINER). As plain INVOKER triggers, RLS on
-- inventory / inventory_items can block the sync UPDATE/INSERT so UI never moves.
-- Run as SECURITY DEFINER with fixed search_path; writes are scoped by row keys only.

create or replace function public.inventory_items_push_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  insert into public.inventory (product_id, business_id, quantity_on_hand)
  values (new.product_id, new.business_id, new.current_stock)
  on conflict (product_id) do update
  set
    quantity_on_hand = excluded.quantity_on_hand,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.inventory_pull_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_items ii
  set
    current_stock = new.quantity_on_hand,
    updated_at = now()
  where ii.business_id = new.business_id
    and ii.product_id = new.product_id
    and ii.current_stock is distinct from new.quantity_on_hand;

  return new;
end;
$$;
