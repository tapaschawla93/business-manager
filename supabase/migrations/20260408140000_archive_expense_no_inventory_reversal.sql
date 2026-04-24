-- archive_expense: hard delete expense row without reversing inventory.
-- Product decision: deleting old stock-purchase expenses should not fail because stock was sold later.

create or replace function public.archive_expense(p_expense_id uuid)
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

  delete from public.expenses
  where id = p_expense_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;
end;
$$;

comment on function public.archive_expense(uuid) is
  'Hard-deletes expense rows; no inventory delta on delete. Operators must adjust inventory manually if needed.';

