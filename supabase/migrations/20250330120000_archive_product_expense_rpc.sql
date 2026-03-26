-- Soft-archive via SECURITY DEFINER RPC (bypasses RLS on UPDATE). Same security model as save_sale:
-- resolve business_id from the caller's active profile, then update only rows in that tenant.

create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
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

  update public.products
  set deleted_at = now()
  where id = p_product_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Product not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_product(uuid) from public;
grant execute on function public.archive_product(uuid) to authenticated;


create or replace function public.archive_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
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

  update public.expenses
  set deleted_at = now()
  where id = p_expense_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_expense(uuid) from public;
grant execute on function public.archive_expense(uuid) to authenticated;
