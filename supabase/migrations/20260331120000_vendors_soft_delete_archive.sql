-- Vendors: soft delete (archive) aligned with products/expenses; partial unique on active names.

alter table public.vendors
  add column if not exists deleted_at timestamptz;

alter table public.vendors
  drop constraint if exists vendors_business_name_key;

create unique index if not exists vendors_business_name_active_uidx
  on public.vendors (business_id, name)
  where deleted_at is null;

drop policy if exists "vendors_select" on public.vendors;
drop policy if exists "vendors_insert" on public.vendors;
drop policy if exists "vendors_update" on public.vendors;

create policy "vendors_select"
  on public.vendors
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "vendors_insert"
  on public.vendors
  for insert
  with check (business_id = public.current_business_id());

create policy "vendors_update"
  on public.vendors
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.business_id = business_id
    )
  );

create or replace function public.archive_vendor(p_vendor_id uuid)
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

  update public.vendors
  set deleted_at = now()
  where id = p_vendor_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Vendor not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_vendor(uuid) from public;
grant execute on function public.archive_vendor(uuid) to authenticated;
