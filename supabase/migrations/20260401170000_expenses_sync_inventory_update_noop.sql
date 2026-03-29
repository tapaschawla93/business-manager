-- Stock-in on new expenses stays client-driven (`inventory_apply_delta_for_tenant` after INSERT).
-- UPDATE (including edit and soft-archive via `deleted_at`) must NOT change the ledger — users adjust
-- inventory manually if an archived/edited expense should be reflected in stock.

create or replace function public.expenses_sync_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    return new;
  elsif tg_op = 'update' then
    return new;
  end if;
  return new;
end;
$$;
