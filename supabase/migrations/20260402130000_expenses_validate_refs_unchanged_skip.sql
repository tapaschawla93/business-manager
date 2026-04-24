-- Idempotent with section 0 of 20260402120000. For databases that already applied
-- an older 20260402120000 without this fix; fresh installs get it from 02120000 first.

create or replace function public.expenses_validate_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null then
    if tg_op = 'UPDATE' and old.product_id is not distinct from new.product_id then
      null;
    elsif not exists (
      select 1
      from public.products pr
      where pr.id = new.product_id
        and pr.business_id = new.business_id
        and pr.deleted_at is null
    ) then
      raise exception 'Expense product_id must reference an active product in this business';
    end if;
  end if;

  if new.vendor_id is not null then
    if tg_op = 'UPDATE' and old.vendor_id is not distinct from new.vendor_id then
      null;
    elsif not exists (
      select 1
      from public.vendors v
      where v.id = new.vendor_id
        and v.business_id = new.business_id
    ) then
      raise exception 'Expense vendor_id must reference a vendor in this business';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_validate_refs_trigger on public.expenses;
create trigger expenses_validate_refs_trigger
before insert or update on public.expenses
for each row
execute function public.expenses_validate_refs();
