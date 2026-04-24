-- archive_expense: optional inventory reversal on delete.
-- Default remains no reversal; caller can opt in per deletion.

create or replace function public.archive_expense(
  p_expense_id uuid,
  p_reverse_inventory boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r public.expenses%rowtype;
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

  select * into r
  from public.expenses e
  where e.id = p_expense_id
    and e.business_id = v_bid
    and e.deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;

  if p_reverse_inventory and r.update_inventory and r.product_id is not null then
    perform public.inventory_apply_delta_for_tenant(
      v_bid,
      r.product_id,
      -(r.quantity)::numeric
    );
  end if;

  delete from public.expenses
  where id = p_expense_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;
end;
$$;

comment on function public.archive_expense(uuid, boolean) is
  'Hard-deletes expense rows; optional inventory reversal for stock-purchase rows when p_reverse_inventory=true.';

grant execute on function public.archive_expense(uuid, boolean) to authenticated;

