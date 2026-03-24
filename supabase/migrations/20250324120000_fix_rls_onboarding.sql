-- UP: Fix review issues on an existing DB that already ran the initial schema.
-- Run once in Supabase SQL Editor if businesses/profiles existed without these fixes.

-- One business : one profile row (v1 single-user business)
alter table public.profiles
  drop constraint if exists profiles_business_id_key;

alter table public.profiles
  add constraint profiles_business_id_key unique (business_id);

create or replace function public.create_business_for_user(p_business_name text default 'My Business')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_existing uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select business_id into v_existing
  from public.profiles
  where id = auth.uid();

  if v_existing is not null then
    return v_existing;
  end if;

  v_name := coalesce(nullif(trim(p_business_name), ''), 'My Business');

  insert into public.businesses (name)
  values (v_name)
  returning id into v_business_id;

  insert into public.profiles (id, business_id)
  values (auth.uid(), v_business_id);

  return v_business_id;
end;
$$;

revoke all on function public.create_business_for_user(text) from public;
grant execute on function public.create_business_for_user(text) to authenticated;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid();
$$;

drop policy if exists "Insert business (authenticated)" on public.businesses;
drop policy if exists "Update own business" on public.businesses;
create policy "Update own business"
  on public.businesses
  for update
  using (id = public.current_business_id())
  with check (id = public.current_business_id());

drop policy if exists "Insert own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and business_id = (
      select p.business_id from public.profiles p where p.id = auth.uid()
    )
  );

-- DOWN (manual rollback — optional)
-- alter table public.profiles drop constraint if exists profiles_business_id_key;
-- drop function if exists public.create_business_for_user(text);
