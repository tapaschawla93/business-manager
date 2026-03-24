-- Supabase core schema: businesses, profiles, RLS baseline, and safe onboarding.
--
-- NOTE: Run in Supabase SQL editor (or migrations) before business-scoped domain tables.
-- For existing projects that already applied an older schema, run
-- `migrations/20250324120000_fix_rls_onboarding.sql` after this file, or merge its fixes.

-- 1) Businesses (v1: one business per user; enforced by unique profiles.business_id)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2) Profiles (1:1 with auth.users, 1:1 with businesses in v1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_business_id_key unique (business_id)
);

-- Keep updated_at in sync
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

-- Current user's business (used by RLS on business-scoped tables)
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

-- Atomic onboarding: create business + profile in one transaction. Bypasses direct INSERT RLS.
-- Idempotent: if the user already has a profile, returns existing business_id.
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

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;

-- Replace policies idempotently (safe if re-run in dev)
drop policy if exists "Select own business" on public.businesses;
drop policy if exists "Update own business" on public.businesses;
drop policy if exists "Insert business (authenticated)" on public.businesses;

create policy "Select own business"
  on public.businesses
  for select
  using (id = public.current_business_id());

create policy "Update own business"
  on public.businesses
  for update
  using (id = public.current_business_id())
  with check (id = public.current_business_id());

-- No direct INSERT on businesses for clients — use create_business_for_user().

drop policy if exists "Select own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;

create policy "Select own profile"
  on public.profiles
  for select
  using (id = auth.uid());

-- Prevent changing business_id to another tenant; full_name updates remain allowed.
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

-- No direct INSERT on profiles for clients — use create_business_for_user().

-- Pattern for future business-scoped tables (documentation only):
--   alter table public.X enable row level security;
--   create policy "X by business" on public.X
--     for all
--     using (business_id = public.current_business_id())
--     with check (business_id = public.current_business_id());
