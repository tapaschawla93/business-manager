-- Supabase schema: tenancy, products (soft delete), sales, atomic save_sale RPC.
-- For existing DBs, prefer applying migrations in order (see supabase/migrations/).

-- -----------------------------------------------------------------------------
-- Shared trigger: bump updated_at on UPDATE
-- -----------------------------------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- 1) Businesses
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.businesses
  add column if not exists default_sale_tag_id uuid;

alter table public.businesses
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 1b) Sale tags (tenant dictionary; FK targets wired after sales/expenses exist)
-- -----------------------------------------------------------------------------
create table if not exists public.sale_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  label text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_tags_label_nonempty check (btrim(label) <> '')
);

create index if not exists sale_tags_business_id_idx on public.sale_tags (business_id);

create unique index if not exists sale_tags_business_label_active_uidx
  on public.sale_tags (business_id, lower(btrim(label)))
  where deleted_at is null;

drop trigger if exists set_sale_tags_updated_at on public.sale_tags;
create trigger set_sale_tags_updated_at
before update on public.sale_tags
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.businesses
  drop constraint if exists businesses_default_sale_tag_id_fkey;

alter table public.businesses
  add constraint businesses_default_sale_tag_id_fkey
  foreign key (default_sale_tag_id) references public.sale_tags (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2) Profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  full_name text,
  password_setup_required boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_business_id_key;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------------------------------
-- 2c) Pending signup requests (admin approval before account creation)
-- -----------------------------------------------------------------------------
create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_norm text not null,
  business_name text not null,
  password_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  approval_token text not null unique,
  decided_by text,
  decision_note text,
  approved_auth_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists signup_requests_pending_email_uidx
  on public.signup_requests (email_norm)
  where status = 'pending';

create index if not exists signup_requests_status_idx
  on public.signup_requests (status, expires_at, created_at);

drop trigger if exists set_signup_requests_updated_at on public.signup_requests;
create trigger set_signup_requests_updated_at
before update on public.signup_requests
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.signup_requests enable row level security;
revoke all on table public.signup_requests from public;

create or replace function public.create_signup_request(
  p_email text,
  p_business_name text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_email_norm text;
  v_business_name text;
  v_existing uuid;
  v_id uuid;
begin
  v_email := coalesce(trim(p_email), '');
  v_business_name := coalesce(trim(p_business_name), '');
  if v_email = '' or position('@' in v_email) <= 1 then
    raise exception 'Valid email is required';
  end if;
  if v_business_name = '' then
    raise exception 'Business name is required';
  end if;
  if coalesce(trim(p_password), '') = '' then
    raise exception 'Password is required';
  end if;
  if length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  v_email_norm := lower(v_email);

  if exists (select 1 from auth.users u where lower(u.email) = v_email_norm) then
    raise exception 'An account with this email already exists';
  end if;

  delete from public.signup_requests
  where email_norm = v_email_norm
    and status in ('expired', 'rejected');

  update public.signup_requests
  set status = 'expired'
  where email_norm = v_email_norm
    and status = 'pending'
    and expires_at <= now();

  select id into v_existing
  from public.signup_requests
  where email_norm = v_email_norm
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.signup_requests (
    email,
    email_norm,
    business_name,
    password_ciphertext,
    approval_token
  ) values (
    v_email_norm,
    v_email_norm,
    v_business_name,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.manual_approve_signup_request(
  p_request_id uuid,
  p_decided_by text default 'administrator'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_business_id uuid;
  v_tag_id uuid;
  v_auth_user_id uuid;
  v_instance_id uuid;
begin
  select *
    into v_req
  from public.signup_requests
  where id = p_request_id
  limit 1;

  if v_req.id is null then
    raise exception 'Signup request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Signup request is not pending';
  end if;
  if v_req.expires_at <= now() then
    delete from public.signup_requests where id = p_request_id;
    raise exception 'Signup request expired';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = lower(v_req.email_norm)) then
    raise exception 'Auth user with this email already exists';
  end if;

  select i.id into v_instance_id
  from auth.instances i
  limit 1;
  if v_instance_id is null then
    v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_instance_id,
    'authenticated',
    'authenticated',
    v_req.email_norm,
    v_req.password_ciphertext,
    now(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    false,
    now(),
    now()
  )
  returning id into v_auth_user_id;

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_auth_user_id::text,
    v_auth_user_id,
    jsonb_build_object(
      'sub', v_auth_user_id::text,
      'email', v_req.email_norm,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.businesses (name, owner_user_id)
  values (v_req.business_name, v_auth_user_id)
  returning id into v_business_id;

  insert into public.sale_tags (business_id, label)
  values (v_business_id, 'General')
  returning id into v_tag_id;

  update public.businesses
  set default_sale_tag_id = v_tag_id
  where id = v_business_id;

  insert into public.profiles (id, business_id, password_setup_required, deleted_at)
  values (v_auth_user_id, v_business_id, false, null)
  on conflict (id) do update
    set business_id = excluded.business_id,
        password_setup_required = false,
        deleted_at = null;

  update public.signup_requests
  set status = 'approved',
      decided_by = coalesce(nullif(trim(p_decided_by), ''), 'administrator'),
      approved_auth_user_id = v_auth_user_id
  where id = p_request_id;

  return v_business_id;
end;
$$;

create or replace function public.manual_reject_signup_request(
  p_request_id uuid,
  p_decided_by text default 'administrator',
  p_decision_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.signup_requests
  where id = p_request_id;
end;
$$;

revoke all on function public.create_signup_request(text, text, text) from public;
revoke all on function public.manual_approve_signup_request(uuid, text) from public;
revoke all on function public.manual_reject_signup_request(uuid, text, text) from public;
revoke all on function public.manual_approve_signup_request(uuid, text) from anon, authenticated;
revoke all on function public.manual_reject_signup_request(uuid, text, text) from anon, authenticated;

grant execute on function public.create_signup_request(text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2b) Team invitations
-- -----------------------------------------------------------------------------
create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  invited_email text not null,
  invited_email_norm text not null,
  invited_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_invitations_business_idx
  on public.business_invitations (business_id, status, expires_at);

create unique index if not exists business_invitations_pending_email_uidx
  on public.business_invitations (business_id, invited_email_norm)
  where status = 'pending';

drop trigger if exists set_business_invitations_updated_at on public.business_invitations;
create trigger set_business_invitations_updated_at
before update on public.business_invitations
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
    and deleted_at is null;
$$;

alter table public.sale_tags enable row level security;

drop policy if exists "sale_tags_select" on public.sale_tags;
drop policy if exists "sale_tags_insert" on public.sale_tags;
drop policy if exists "sale_tags_update" on public.sale_tags;

create policy "sale_tags_select"
  on public.sale_tags
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "sale_tags_insert"
  on public.sale_tags
  for insert
  with check (business_id = public.current_business_id());

create policy "sale_tags_update"
  on public.sale_tags
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

drop policy if exists "sale_tags_delete" on public.sale_tags;
create policy "sale_tags_delete"
  on public.sale_tags
  for delete
  using (business_id = public.current_business_id());

grant select, insert, update, delete on public.sale_tags to authenticated;

create or replace function public.is_current_user_business_owner(p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = coalesce(p_business_id, public.current_business_id())
      and b.owner_user_id = auth.uid()
      and b.deleted_at is null
  );
$$;

create or replace function public.create_business_invitation(p_invited_email text)
returns table (
  id uuid,
  invited_email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_email text;
  v_email_norm text;
  v_pending_count integer;
  v_existing record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_business_id := public.current_business_id();
  if v_business_id is null then
    raise exception 'No business profile found';
  end if;
  if not public.is_current_user_business_owner(v_business_id) then
    raise exception 'Only the business creator can invite members';
  end if;

  v_email := coalesce(trim(p_invited_email), '');
  if v_email = '' then
    raise exception 'Invite email is required';
  end if;
  if position('@' in v_email) <= 1 then
    raise exception 'Invite email is invalid';
  end if;
  v_email_norm := lower(v_email);

  update public.business_invitations bi
  set status = 'expired'
  where bi.business_id = v_business_id
    and bi.status = 'pending'
    and bi.expires_at <= now();

  if exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.business_id = v_business_id
      and p.deleted_at is null
      and lower(u.email) = v_email_norm
  ) then
    raise exception 'This email already belongs to a member in your business';
  end if;

  -- Idempotent behavior: if a pending invite already exists, return it.
  select bi.id, bi.invited_email, bi.expires_at
    into v_existing
  from public.business_invitations bi
  where bi.business_id = v_business_id
    and bi.invited_email_norm = v_email_norm
    and bi.status = 'pending'
  order by bi.created_at desc
  limit 1;

  if v_existing.id is not null then
    id := v_existing.id;
    invited_email := v_existing.invited_email;
    expires_at := v_existing.expires_at;
    return next;
    return;
  end if;

  select count(*)
    into v_pending_count
  from public.business_invitations bi
  where bi.business_id = v_business_id
    and bi.status = 'pending'
    and bi.expires_at > now();
  if v_pending_count >= 3 then
    raise exception 'Maximum of 3 pending invites reached';
  end if;

  begin
    insert into public.business_invitations (business_id, invited_email, invited_email_norm, invited_by)
    values (v_business_id, v_email, v_email_norm, auth.uid())
    returning business_invitations.id, business_invitations.invited_email, business_invitations.expires_at
    into id, invited_email, expires_at;
  exception
    when unique_violation then
      -- Concurrent duplicate invite attempt: return the existing pending row.
      select bi.id, bi.invited_email, bi.expires_at
        into id, invited_email, expires_at
      from public.business_invitations bi
      where bi.business_id = v_business_id
        and bi.invited_email_norm = v_email_norm
        and bi.status = 'pending'
      order by bi.created_at desc
      limit 1;
      if id is null then
        raise;
      end if;
  end;

  return next;
end;
$$;

create or replace function public.list_business_members()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  is_owner boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_business_id := public.current_business_id();
  if v_business_id is null then
    raise exception 'No business profile found';
  end if;
  if not public.is_current_user_business_owner(v_business_id) then
    raise exception 'Only the business creator can view team members';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text as email,
    p.full_name,
    p.created_at,
    (b.owner_user_id = p.id) as is_owner
  from public.profiles p
  join public.businesses b on b.id = p.business_id
  left join auth.users u on u.id = p.id
  where p.business_id = v_business_id
    and p.deleted_at is null
  order by
    (b.owner_user_id = p.id) desc,
    p.created_at asc;
end;
$$;

create or replace function public.list_business_pending_invitations()
returns table (
  id uuid,
  invited_email text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_business_id := public.current_business_id();
  if v_business_id is null then
    raise exception 'No business profile found';
  end if;
  if not public.is_current_user_business_owner(v_business_id) then
    raise exception 'Only the business creator can view invitations';
  end if;

  update public.business_invitations bi
  set status = 'expired'
  where bi.business_id = v_business_id
    and bi.status = 'pending'
    and bi.expires_at <= now();

  return query
  select bi.id, bi.invited_email, bi.expires_at, bi.created_at
  from public.business_invitations bi
  where bi.business_id = v_business_id
    and bi.status = 'pending'
  order by bi.created_at desc;
end;
$$;

create or replace function public.revoke_business_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_business_id := public.current_business_id();
  if not public.is_current_user_business_owner(v_business_id) then
    raise exception 'Only the business creator can revoke invitations';
  end if;

  update public.business_invitations bi
  set status = 'revoked'
  where bi.id = p_invitation_id
    and bi.business_id = v_business_id
    and bi.status = 'pending';
end;
$$;

create or replace function public.remove_business_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_business_id := public.current_business_id();
  if not public.is_current_user_business_owner(v_business_id) then
    raise exception 'Only the business creator can remove members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Business creator cannot remove themselves';
  end if;

  update public.profiles p
  set deleted_at = now()
  where p.id = p_user_id
    and p.business_id = v_business_id
    and p.deleted_at is null;
end;
$$;

create or replace function public.accept_business_invitation_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_business_id uuid;
  v_email_norm text;
  v_invite record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email_norm := lower(coalesce(auth.jwt()->>'email', ''));
  if v_email_norm = '' then
    return null;
  end if;

  select p.business_id into v_existing_business_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  select bi.id, bi.business_id
    into v_invite
  from public.business_invitations bi
  where bi.invited_email_norm = v_email_norm
    and bi.status = 'pending'
    and bi.expires_at > now()
  order by bi.created_at desc
  limit 1;

  if v_invite.id is null then
    return v_existing_business_id;
  end if;
  if v_existing_business_id is not null and v_existing_business_id <> v_invite.business_id then
    raise exception 'This account already belongs to another business';
  end if;

  insert into public.profiles (id, business_id, password_setup_required)
  values (auth.uid(), v_invite.business_id, true)
  on conflict (id) do update
    set business_id = excluded.business_id,
        deleted_at = null,
        password_setup_required = true;

  update public.business_invitations
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = v_invite.id;

  return v_invite.business_id;
end;
$$;

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
  v_tag_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select business_id into v_existing
  from public.profiles
  where id = auth.uid()
    and deleted_at is null;

  if v_existing is not null then
    return v_existing;
  end if;

  v_name := coalesce(nullif(trim(p_business_name), ''), 'My Business');

  insert into public.businesses (name, owner_user_id)
  values (v_name, auth.uid())
  returning id into v_business_id;

  insert into public.sale_tags (business_id, label)
  values (v_business_id, 'General')
  returning id into v_tag_id;

  update public.businesses
  set default_sale_tag_id = v_tag_id
  where id = v_business_id;

  insert into public.profiles (id, business_id)
  values (auth.uid(), v_business_id)
  on conflict (id) do update
    set business_id = excluded.business_id,
        deleted_at = null,
        password_setup_required = false;

  return v_business_id;
end;
$$;

create or replace function public.mark_password_setup_complete()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set password_setup_required = false
  where id = auth.uid()
    and deleted_at is null;
end;
$$;

create or replace function public.get_current_user_onboarding_gate()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_norm text;
  v_profile record;
  v_latest_invite_status text;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  select p.id, p.deleted_at
    into v_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_profile.id is not null then
    if v_profile.deleted_at is not null then
      return 'revoked_member';
    end if;
    return 'active_profile';
  end if;

  v_email_norm := lower(coalesce(auth.jwt()->>'email', ''));
  if v_email_norm = '' then
    return 'no_profile';
  end if;

  select bi.status
    into v_latest_invite_status
  from public.business_invitations bi
  where bi.invited_email_norm = v_email_norm
  order by bi.created_at desc
  limit 1;

  if v_latest_invite_status = 'revoked' then
    return 'revoked_invite';
  end if;
  if v_latest_invite_status = 'expired' then
    return 'expired_invite';
  end if;

  return 'no_profile';
end;
$$;

revoke all on function public.is_current_user_business_owner(uuid) from public;
revoke all on function public.create_business_invitation(text) from public;
revoke all on function public.list_business_members() from public;
revoke all on function public.list_business_pending_invitations() from public;
revoke all on function public.revoke_business_invitation(uuid) from public;
revoke all on function public.remove_business_member(uuid) from public;
revoke all on function public.accept_business_invitation_for_current_user() from public;
revoke all on function public.mark_password_setup_complete() from public;
revoke all on function public.get_current_user_onboarding_gate() from public;
revoke all on function public.create_business_for_user(text) from public;

grant execute on function public.is_current_user_business_owner(uuid) to authenticated;
grant execute on function public.create_business_invitation(text) to authenticated;
grant execute on function public.list_business_members() to authenticated;
grant execute on function public.list_business_pending_invitations() to authenticated;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;
grant execute on function public.remove_business_member(uuid) to authenticated;
grant execute on function public.accept_business_invitation_for_current_user() to authenticated;
grant execute on function public.mark_password_setup_complete() to authenticated;
grant execute on function public.get_current_user_onboarding_gate() to authenticated;
grant execute on function public.create_business_for_user(text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: businesses + profiles
-- -----------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.business_invitations enable row level security;

drop policy if exists "Select own business" on public.businesses;
drop policy if exists "Update own business" on public.businesses;
drop policy if exists "Insert business (authenticated)" on public.businesses;

create policy "Select own business"
  on public.businesses
  for select
  using (id = public.current_business_id() and deleted_at is null);

create policy "Update own business"
  on public.businesses
  for update
  using (id = public.current_business_id() and deleted_at is null)
  with check (id = public.current_business_id());

drop policy if exists "Select own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;

create policy "Select own profile"
  on public.profiles
  for select
  using (id = auth.uid() and deleted_at is null);

create policy "Update own profile"
  on public.profiles
  for update
  using (id = auth.uid() and deleted_at is null)
  with check (
    id = auth.uid()
    and business_id = (
      select p.business_id from public.profiles p where p.id = auth.uid()
    )
  );

revoke all on table public.business_invitations from public;
grant select, insert, update on table public.business_invitations to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  variant text,
  category text not null,
  mrp numeric(12, 2) not null,
  cost_price numeric(12, 2) not null,
  hsn_code text,
  tax_pct numeric(5, 2),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_mrp_nonneg check (mrp >= 0),
  constraint products_cost_price_nonneg check (cost_price >= 0),
  constraint products_tax_pct_range check (
    tax_pct is null or (tax_pct >= 0 and tax_pct <= 100)
  )
);

create index if not exists products_business_id_idx on public.products (business_id);

-- Unique (name, variant) per business among active products only (archived rows may reuse keys).
-- Variant null is treated like empty string for uniqueness.
create unique index if not exists products_business_id_name_variant_active_uidx
  on public.products (business_id, name, coalesce(variant, ''))
  where deleted_at is null;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;

create policy "products_select"
  on public.products
  for select
  using (business_id = public.current_business_id() and deleted_at is null);

create policy "products_insert"
  on public.products
  for insert
  with check (business_id = public.current_business_id());

-- WITH CHECK: invoker-safe tenant match (do not require deleted_at IS NULL on new row).
-- Do not use RETURNING/select after archive — SELECT policies hide archived rows.
create policy "products_update"
  on public.products
  for update
  using (business_id = public.current_business_id() and deleted_at is null)
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.business_id = business_id
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Sales + sale_items
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  date date not null,
  customer_name text,
  customer_phone text,
  customer_address text,
  sale_type text check (sale_type is null or sale_type in ('B2C', 'B2B', 'B2B2C')),
  payment_mode text not null check (payment_mode in ('cash', 'online')),
  total_amount numeric(10, 2) not null default 0,
  total_cost numeric(10, 2) not null default 0,
  total_profit numeric(10, 2) not null default 0,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0),
  sale_price numeric(10, 2) not null check (sale_price >= 0),
  cost_price_snapshot numeric(10, 2) not null,
  mrp_snapshot numeric(10, 2) not null,
  vs_mrp numeric(10, 2) not null,
  profit numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_business_id_idx on public.sales (business_id);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

alter table public.sales
  add column if not exists sale_tag_id uuid references public.sale_tags (id) on delete set null;

create index if not exists sales_sale_tag_id_idx on public.sales (sale_tag_id);

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at
before update on public.sales
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_sale_items_updated_at on public.sale_items;
create trigger set_sale_items_updated_at
before update on public.sale_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "sales_select_active" on public.sales;
drop policy if exists "sales_insert" on public.sales;
drop policy if exists "sales_update" on public.sales;

create policy "sales_select_active"
  on public.sales
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "sales_update"
  on public.sales
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (business_id = public.current_business_id());

drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select"
  on public.sale_items
  for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.business_id = public.current_business_id()
        and s.deleted_at is null
    )
  );

drop policy if exists "sale_items_delete" on public.sale_items;
create policy "sale_items_delete"
  on public.sale_items
  for delete
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and s.business_id = public.current_business_id()
    )
  );

drop policy if exists "sales_delete" on public.sales;
create policy "sales_delete"
  on public.sales
  for delete
  using (business_id = public.current_business_id());

-- -----------------------------------------------------------------------------
-- 4b) Vendors (tenant directory; optional link from expenses.vendor_id)
-- -----------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_business_id_idx on public.vendors (business_id);

create unique index if not exists vendors_business_name_active_uidx
  on public.vendors (business_id, name)
  where deleted_at is null;

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at
before update on public.vendors
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.vendors enable row level security;

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

-- -----------------------------------------------------------------------------
-- 4c) Inventory ledger (per product) + manual inventory_items (V2)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory (
  product_id uuid primary key references public.products (id) on delete restrict,
  business_id uuid not null references public.businesses (id) on delete restrict,
  quantity_on_hand numeric(12, 3) not null default 0 check (quantity_on_hand >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_business_id_idx on public.inventory (business_id);

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
before update on public.inventory
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.inventory enable row level security;

drop policy if exists "inventory_select" on public.inventory;
drop policy if exists "inventory_insert" on public.inventory;
drop policy if exists "inventory_update" on public.inventory;

create policy "inventory_select"
  on public.inventory
  for select
  using (business_id = public.current_business_id());

create policy "inventory_insert"
  on public.inventory
  for insert
  with check (business_id = public.current_business_id());

create policy "inventory_update"
  on public.inventory
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  unit text not null default 'pcs',
  current_stock numeric(12, 3) not null default 0 check (current_stock >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  reorder_level numeric(12, 3),
  product_id uuid references public.products (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_business_id_idx on public.inventory_items (business_id);
create index if not exists inventory_items_product_id_idx on public.inventory_items (product_id);

create unique index if not exists inventory_items_business_product_uidx
  on public.inventory_items (business_id, product_id)
  where product_id is not null;

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.inventory_items enable row level security;

drop policy if exists "inventory_items_select" on public.inventory_items;
drop policy if exists "inventory_items_insert" on public.inventory_items;
drop policy if exists "inventory_items_update" on public.inventory_items;
drop policy if exists "inventory_items_delete" on public.inventory_items;

create policy "inventory_items_select"
  on public.inventory_items
  for select
  using (business_id = public.current_business_id());

create policy "inventory_items_insert"
  on public.inventory_items
  for insert
  with check (business_id = public.current_business_id());

create policy "inventory_items_update"
  on public.inventory_items
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "inventory_items_delete"
  on public.inventory_items
  for delete
  using (business_id = public.current_business_id());

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
    updated_at = now()
  where public.inventory.quantity_on_hand is distinct from excluded.quantity_on_hand;
  return new;
end;
$$;

drop trigger if exists inventory_items_push_to_ledger_trigger on public.inventory_items;
create trigger inventory_items_push_to_ledger_trigger
after insert or update of current_stock, product_id, business_id on public.inventory_items
for each row
execute function public.inventory_items_push_to_ledger();

create or replace function public.inventory_pull_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_cost numeric(12, 2);
begin
  if exists (
    select 1
    from public.inventory_items ii
    where
      ii.business_id = new.business_id
      and ii.product_id = new.product_id
  ) then
    update public.inventory_items ii
    set
      current_stock = new.quantity_on_hand,
      updated_at = now()
    where
      ii.business_id = new.business_id
      and ii.product_id = new.product_id
      and ii.current_stock is distinct from new.quantity_on_hand;
  else
    select
      case
        when coalesce(trim(p.variant), '') = '' then trim(p.name)
        else trim(p.name) || ' · ' || trim(p.variant)
      end,
      coalesce(p.cost_price, 0::numeric)::numeric(12, 2)
    into v_name, v_cost
    from public.products p
    where
      p.id = new.product_id
      and p.business_id = new.business_id
      and p.deleted_at is null;

    if v_name is not null then
      insert into public.inventory_items (
        business_id,
        name,
        unit,
        current_stock,
        unit_cost,
        reorder_level,
        product_id
      )
      values (
        new.business_id,
        v_name,
        'pcs',
        new.quantity_on_hand,
        v_cost,
        null,
        new.product_id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_pull_to_items_trigger on public.inventory;
create trigger inventory_pull_to_items_trigger
after update of quantity_on_hand on public.inventory
for each row
execute function public.inventory_pull_to_items();

-- Ledger delta (SECURITY DEFINER) — used by save_sale and expense stock triggers.
create or replace function public.inventory_apply_delta(
  p_business_id uuid,
  p_product_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_new numeric;
begin
  if p_business_id is null or p_product_id is null then
    raise exception 'inventory_apply_delta: business_id and product_id required';
  end if;
  if p_delta is null then
    raise exception 'inventory_apply_delta: delta required';
  end if;
  if p_delta = 0 then
    return;
  end if;

  if p_delta < 0 then
    if exists (
      select 1 from public.product_components pc where pc.product_id = p_product_id
    ) then
      return;
    end if;
  end if;

  insert into public.inventory (business_id, product_id, quantity_on_hand)
  values (p_business_id, p_product_id, 0)
  on conflict (product_id) do nothing;

  select quantity_on_hand
  into v_current
  from public.inventory
  where product_id = p_product_id
    and business_id = p_business_id
  for update;

  if v_current is null then
    raise exception 'inventory_apply_delta: ledger row missing after upsert';
  end if;

  v_new := round((v_current + p_delta)::numeric, 3);

  if v_new < 0 then
    raise exception 'Insufficient stock for this sale (inventory would go negative).';
  end if;

  update public.inventory
  set
    quantity_on_hand = v_new,
    updated_at = now()
  where product_id = p_product_id
    and business_id = p_business_id;
end;
$$;

revoke all on function public.inventory_apply_delta(uuid, uuid, numeric) from public;

-- Called from browser after a stock-purchase expense INSERT (insert trigger no longer applies delta).
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

-- Align catalog cost from a stock-purchase expense (called from app after expense insert/update).
create or replace function public.sync_product_cost_from_expense(
  p_business_id uuid,
  p_product_id uuid,
  p_unit_cost numeric
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
  update public.products
    set cost_price = p_unit_cost, updated_at = now()
    where id = p_product_id and business_id = p_business_id;

  update public.inventory_items
    set unit_cost = p_unit_cost, updated_at = now()
    where product_id = p_product_id and business_id = p_business_id;
end;
$$;

revoke all on function public.sync_product_cost_from_expense(uuid, uuid, numeric) from public;
grant execute on function public.sync_product_cost_from_expense(uuid, uuid, numeric) to authenticated;

-- Mirror ledger qty into inventory_items (after stock expense; idempotent if trigger already ran).
create or replace function public.reconcile_inventory_line_for_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_qty numeric(12, 3);
  v_name text;
  v_cost numeric(12, 2);
begin
  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business profile';
  end if;

  if not exists (
    select 1
    from public.products p
    where
      p.id = p_product_id
      and p.business_id = v_bid
      and p.deleted_at is null
  ) then
    raise exception 'Product not found for this business';
  end if;

  select i.quantity_on_hand
  into v_qty
  from public.inventory i
  where
    i.product_id = p_product_id
    and i.business_id = v_bid;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.inventory_items ii
    where
      ii.business_id = v_bid
      and ii.product_id = p_product_id
  ) then
    update public.inventory_items ii
    set
      current_stock = v_qty,
      updated_at = now()
    where
      ii.business_id = v_bid
      and ii.product_id = p_product_id
      and ii.current_stock is distinct from v_qty;
  else
    select
      case
        when coalesce(trim(p.variant), '') = '' then trim(p.name)
        else trim(p.name) || ' · ' || trim(p.variant)
      end,
      coalesce(p.cost_price, 0::numeric)::numeric(12, 2)
    into v_name, v_cost
    from public.products p
    where
      p.id = p_product_id
      and p.business_id = v_bid
      and p.deleted_at is null;

    if v_name is null then
      return;
    end if;

    insert into public.inventory_items (
      business_id,
      name,
      unit,
      current_stock,
      unit_cost,
      reorder_level,
      product_id
    )
    values (
      v_bid,
      v_name,
      'pcs',
      v_qty,
      v_cost,
      null,
      p_product_id
    );
  end if;
end;
$$;

revoke all on function public.reconcile_inventory_line_for_product(uuid) from public;
grant execute on function public.reconcile_inventory_line_for_product(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Expenses (soft delete; no DELETE policy)
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  date timestamptz not null default now(),
  vendor_name text not null,
  vendor_id uuid references public.vendors (id) on delete set null,
  item_description text not null,
  product_id uuid references public.products (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_cost numeric(10, 2) not null check (unit_cost >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  payment_mode text not null check (payment_mode in ('cash', 'online')),
  notes text,
  update_inventory boolean not null default true,
  category text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists expense_tag_id uuid references public.sale_tags (id) on delete set null;

create index if not exists expenses_expense_tag_id_idx on public.expenses (expense_tag_id);

comment on column public.expenses.update_inventory is
  'When true and product_id is set, expense quantity adjusts inventory via expenses_sync_inventory trigger.';

comment on column public.expenses.category is
  'Optional label for non-inventory spend (e.g. Marketing, Rent). Null for stock purchases.';

create index if not exists expenses_business_id_idx on public.expenses (business_id);
create index if not exists expenses_vendor_id_idx on public.expenses (vendor_id);
create index if not exists expenses_product_id_idx on public.expenses (product_id);

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.expenses enable row level security;

drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;

create policy "expenses_select"
  on public.expenses
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

create policy "expenses_insert"
  on public.expenses
  for insert
  with check (business_id = public.current_business_id());

create policy "expenses_update"
  on public.expenses
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

-- Enforce product/vendor refs on INSERT and when those columns change on UPDATE
-- (so tag-only or other updates do not fail for legacy rows with archived products).
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

drop trigger if exists expenses_sync_inventory_trigger on public.expenses;
create trigger expenses_sync_inventory_trigger
  after insert or update on public.expenses
  for each row
  execute function public.expenses_sync_inventory();

-- -----------------------------------------------------------------------------
-- "Archive" RPCs (SECURITY DEFINER): permanent DELETE from DB + referential cleanup.
-- -----------------------------------------------------------------------------
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

  if not exists (
    select 1
    from public.products pr
    where pr.id = p_product_id
      and pr.business_id = v_bid
      and pr.deleted_at is null
  ) then
    raise exception 'Product not found, already archived, or access denied';
  end if;

  if exists (
    select 1 from public.sale_items si where si.product_id = p_product_id
  ) then
    raise exception 'Cannot delete product: it is referenced by sales lines. Remove or change those sales first.';
  end if;

  if exists (
    select 1
    from public.expenses e
    where e.product_id = p_product_id
      and e.business_id = v_bid
      and e.deleted_at is null
  ) then
    raise exception 'Cannot delete product: it is referenced by active expenses.';
  end if;

  update public.inventory_items
  set product_id = null, updated_at = now()
  where product_id = p_product_id
    and business_id = v_bid;

  delete from public.inventory
  where product_id = p_product_id
    and business_id = v_bid;

  delete from public.products
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

revoke all on function public.archive_expense(uuid, boolean) from public;
grant execute on function public.archive_expense(uuid, boolean) to authenticated;

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

  delete from public.vendors
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

create or replace function public.archive_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r record;
  r_component record;
  v_component_delta numeric;
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

  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id and s.business_id = v_bid and s.deleted_at is null
  ) then
    raise exception 'Sale not found, already archived, or access denied';
  end if;

  for r in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
  loop
    if not exists (
      select 1 from public.product_components pc where pc.product_id = r.product_id
    ) then
      perform public.inventory_apply_delta(v_bid, r.product_id, r.quantity);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = r.product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * r.quantity)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock + v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid;
    end loop;
  end loop;

  delete from public.sale_items where sale_id = p_sale_id;
  delete from public.sales
  where id = p_sale_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Sale not found, already archived, or access denied';
  end if;
end;
$$;

revoke all on function public.archive_sale(uuid) from public;
grant execute on function public.archive_sale(uuid) to authenticated;

create or replace function public.delete_inventory_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_product_id uuid;
  v_stock numeric;
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

  select ii.product_id, ii.current_stock
  into v_product_id, v_stock
  from public.inventory_items ii
  where ii.id = p_item_id
    and ii.business_id = v_bid;

  if not found then
    raise exception 'Inventory line not found or access denied';
  end if;

  if v_product_id is not null and v_stock is not null and v_stock > 0 then
    perform public.inventory_apply_delta(v_bid, v_product_id, -v_stock);
  end if;

  delete from public.inventory_items
  where id = p_item_id
    and business_id = v_bid;

  if not found then
    raise exception 'Inventory line not found or access denied';
  end if;
end;
$$;

revoke all on function public.delete_inventory_item(uuid) from public;
grant execute on function public.delete_inventory_item(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Dashboard RPCs (read-only): date-scoped KPIs, top products, category split
-- -----------------------------------------------------------------------------

create or replace function public.get_dashboard_kpis(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
returns table (
  total_revenue numeric(12, 2),
  total_expenses numeric(12, 2),
  inventory_value numeric(12, 2),
  gross_profit numeric(12, 2),
  net_cash numeric(12, 2),
  net_online numeric(12, 2),
  cash_in_hand_total numeric(12, 2),
  sales_count bigint,
  average_sale_value numeric(12, 2)
)
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

  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;

  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  return query
  with
  sales_agg as (
    select
      sum(s.total_amount)::numeric(12, 2) as total_revenue,
      sum(s.total_amount) filter (where s.payment_mode = 'cash')::numeric(12, 2) as cash_sales,
      sum(s.total_amount) filter (where s.payment_mode = 'online')::numeric(12, 2) as online_sales,
      count(s.id)::bigint as sales_count
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
  ),
  -- All tags: operating expenses. Single tag: COGS from sale_items for sales in that tag.
  counter_agg as (
    select * from (
      select
        coalesce(sum(e.total_amount), 0)::numeric(12, 2) as total_out,
        coalesce(sum(e.total_amount) filter (where e.payment_mode = 'cash'), 0)::numeric(12, 2) as cash_out,
        coalesce(sum(e.total_amount) filter (where e.payment_mode = 'online'), 0)::numeric(12, 2) as online_out
      from public.expenses e
      where e.business_id = v_bid
        and e.deleted_at is null
        and (e.date::date) >= p_from
        and (e.date::date) <= p_to
    ) x
    where p_sale_tag_id is null
    union all
    select * from (
      select
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)),
          0
        )::numeric(12, 2) as total_out,
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)) filter (where s.payment_mode = 'cash'),
          0
        )::numeric(12, 2) as cash_out,
        coalesce(
          sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2)) filter (where s.payment_mode = 'online'),
          0
        )::numeric(12, 2) as online_out
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where s.business_id = v_bid
        and s.deleted_at is null
        and s.date >= p_from
        and s.date <= p_to
        and s.sale_tag_id = p_sale_tag_id
    ) y
    where p_sale_tag_id is not null
  ),
  inv_val as (
    select
      coalesce(
        sum(round((ii.current_stock * ii.unit_cost)::numeric, 2)),
        0
      )::numeric(12, 2) as inventory_value
    from public.inventory_items ii
    where ii.business_id = v_bid
  )
  select
    coalesce(sa.total_revenue, 0)::numeric(12, 2) as total_revenue,
    coalesce(ca.total_out, 0)::numeric(12, 2) as total_expenses,
    coalesce(iv.inventory_value, 0)::numeric(12, 2) as inventory_value,
    (coalesce(sa.total_revenue, 0) - coalesce(ca.total_out, 0))::numeric(12, 2) as gross_profit,
    (coalesce(sa.cash_sales, 0) - coalesce(ca.cash_out, 0))::numeric(12, 2) as net_cash,
    (coalesce(sa.online_sales, 0) - coalesce(ca.online_out, 0))::numeric(12, 2) as net_online,
    (
      (coalesce(sa.cash_sales, 0) - coalesce(ca.cash_out, 0))
      + (coalesce(sa.online_sales, 0) - coalesce(ca.online_out, 0))
    )::numeric(12, 2) as cash_in_hand_total,
    coalesce(sa.sales_count, 0)::bigint as sales_count,
    case
      when coalesce(sa.sales_count, 0) = 0 then 0::numeric(12, 2)
      else (coalesce(sa.total_revenue, 0) / coalesce(sa.sales_count, 0))::numeric(12, 2)
    end as average_sale_value
  from sales_agg sa
  cross join counter_agg ca
  cross join inv_val iv;
end;
$$;

revoke all on function public.get_dashboard_kpis(date, date, uuid) from public;
grant execute on function public.get_dashboard_kpis(date, date, uuid) to authenticated;

create or replace function public.get_top_products(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
returns jsonb
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

  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;

  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  return (
    with
    line_base as (
      select
        si.product_id,
        si.quantity,
        (si.sale_price * si.quantity)::numeric(12, 2) as line_revenue,
        case
          when si.cost_price_snapshot > 0 then
            (((si.sale_price - si.cost_price_snapshot) / si.cost_price_snapshot) * 100)::numeric(12, 2)
          else null
        end as line_margin_pct
      from public.sale_items si
      join public.sales s
        on s.id = si.sale_id
      where s.business_id = v_bid
        and s.deleted_at is null
        and s.date >= p_from
        and s.date <= p_to
        and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
    ),
    product_aggs as (
      select
        p.id as product_id,
        p.name as product_name,
        p.variant as product_variant,
        sum(lb.line_revenue)::numeric(12, 2) as revenue,
        sum(lb.quantity)::numeric(12, 3) as quantity_sold,
        avg(lb.line_margin_pct) filter (where lb.line_margin_pct is not null)::numeric(12, 2) as avg_margin_pct
      from line_base lb
      join public.products p
        on p.id = lb.product_id
      where p.deleted_at is null
        and p.business_id = v_bid
      group by p.id, p.name, p.variant
    ),
    top_rev as (
      select *
      from product_aggs
      order by revenue desc nulls last
      limit 5
    ),
    top_margin as (
      select *
      from product_aggs
      where avg_margin_pct is not null
      order by avg_margin_pct desc nulls last
      limit 5
    ),
    top_vol as (
      select *
      from product_aggs
      order by quantity_sold desc nulls last
      limit 5
    ),
    category_agg as (
      select
        p.category,
        sum(si.sale_price * si.quantity)::numeric(12, 2) as revenue
      from public.sale_items si
      join public.sales s
        on s.id = si.sale_id
      join public.products p
        on p.id = si.product_id
      where s.business_id = v_bid
        and s.deleted_at is null
        and s.date >= p_from
        and s.date <= p_to
        and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
        and p.deleted_at is null
        and p.business_id = v_bid
      group by p.category
    )
    select jsonb_build_object(
      'top_by_revenue',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tr.product_id,
                'label',
                  case
                    when tr.product_variant is null or btrim(tr.product_variant) = '' then tr.product_name
                    else tr.product_name || ' — ' || tr.product_variant
                  end,
                'revenue', round(tr.revenue, 2),
                'avg_margin_pct',
                  case when tr.avg_margin_pct is null then null else round(tr.avg_margin_pct, 2) end
              )
            )
            from top_rev tr
          ),
          '[]'::jsonb
        ),
      'top_by_margin',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tm.product_id,
                'label',
                  case
                    when tm.product_variant is null or btrim(tm.product_variant) = '' then tm.product_name
                    else tm.product_name || ' — ' || tm.product_variant
                  end,
                'revenue', round(tm.revenue, 2),
                'avg_margin_pct', round(tm.avg_margin_pct, 2)
              )
            )
            from top_margin tm
          ),
          '[]'::jsonb
        ),
      'top_by_volume',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_id', tv.product_id,
                'label',
                  case
                    when tv.product_variant is null or btrim(tv.product_variant) = '' then tv.product_name
                    else tv.product_name || ' — ' || tv.product_variant
                  end,
                'quantity_sold', round(tv.quantity_sold, 3),
                'revenue', round(tv.revenue, 2)
              )
            )
            from top_vol tv
          ),
          '[]'::jsonb
        ),
      'sales_by_category',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('category', ca.category, 'revenue', round(ca.revenue, 2))
              order by ca.revenue desc nulls last
            )
            from category_agg ca
          ),
          '[]'::jsonb
        )
    ));
end;
$$;

revoke all on function public.get_top_products(date, date, uuid) from public;
grant execute on function public.get_top_products(date, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- V3 foundation: customers + sales.customer_id + product_components
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  phone text,
  address text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_id_idx on public.customers (business_id);
create index if not exists customers_phone_idx on public.customers (phone);

create unique index if not exists customers_business_phone_active_uidx
  on public.customers (business_id, phone)
  where deleted_at is null and phone is not null and btrim(phone) <> '';

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.customers enable row level security;

drop policy if exists "customers_select_active" on public.customers;
create policy "customers_select_active"
  on public.customers
  for select
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  );

drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert"
  on public.customers
  for insert
  with check (business_id = public.current_business_id());

drop policy if exists "customers_update" on public.customers;
create policy "customers_update"
  on public.customers
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

drop policy if exists "customers_delete" on public.customers;
create policy "customers_delete"
  on public.customers
  for delete
  using (business_id = public.current_business_id());

alter table public.sales
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index if not exists sales_customer_id_idx on public.sales (customer_id);

create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity_per_unit numeric(10, 3) not null check (quantity_per_unit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, inventory_item_id)
);

create index if not exists product_components_product_id_idx on public.product_components (product_id);
create index if not exists product_components_inventory_item_id_idx on public.product_components (inventory_item_id);

drop trigger if exists set_product_components_updated_at on public.product_components;
create trigger set_product_components_updated_at
before update on public.product_components
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.product_components enable row level security;

drop policy if exists "product_components_select" on public.product_components;
create policy "product_components_select"
  on public.product_components
  for select
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  );

drop policy if exists "product_components_insert" on public.product_components;
create policy "product_components_insert"
  on public.product_components
  for insert
  with check (
    exists (
      select 1
      from public.products p
      join public.inventory_items ii on ii.id = product_components.inventory_item_id
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
        and ii.business_id = p.business_id
    )
  );

drop policy if exists "product_components_update" on public.product_components;
create policy "product_components_update"
  on public.product_components
  for update
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.inventory_items ii on ii.id = product_components.inventory_item_id
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
        and ii.business_id = p.business_id
    )
  );

drop policy if exists "product_components_delete" on public.product_components;
create policy "product_components_delete"
  on public.product_components
  for delete
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_components.product_id
        and p.business_id = public.current_business_id()
        and p.deleted_at is null
    )
  );

-- -----------------------------------------------------------------------------
-- V3 save_sale/update_sale: customer auto-link + component stock deltas
-- -----------------------------------------------------------------------------
create or replace function public.save_sale(
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null,
  p_sale_tag_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_sale_id uuid;
  v_elem jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_sale_price numeric;
  v_mrp numeric;
  v_cost numeric;
  v_vs_mrp numeric;
  v_line_profit numeric;
  v_total_amount numeric := 0;
  v_total_cost numeric := 0;
  v_line_rev numeric;
  v_line_cost numeric;
  v_customer_phone text;
  v_customer_name text;
  v_customer_address text;
  v_customer_id uuid;
  r_component record;
  v_component_delta numeric;
  v_component_stock numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is null then
    raise exception 'sale_tag_id is required';
  end if;
  if not exists (
    select 1
    from public.sale_tags st
    where st.id = p_sale_tag_id
      and st.business_id = v_bid
      and st.deleted_at is null
  ) then
    raise exception 'Invalid sale tag';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('cash', 'online') then
    raise exception 'Invalid payment_mode';
  end if;
  if p_sale_type is not null and p_sale_type not in ('B2C', 'B2B', 'B2B2C') then
    raise exception 'Invalid sale_type';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_customer_name := coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), 'Customer');
  v_customer_address := nullif(trim(coalesce(p_customer_address, '')), '');

  if v_customer_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.business_id = v_bid
      and c.phone = v_customer_phone
      and c.deleted_at is null
    limit 1;

    if v_customer_id is null then
      insert into public.customers (business_id, name, phone, address)
      values (v_bid, v_customer_name, v_customer_phone, v_customer_address)
      returning id into v_customer_id;
    else
      update public.customers
      set
        name = v_customer_name,
        address = coalesce(v_customer_address, address)
      where id = v_customer_id
        and business_id = v_bid;
    end if;
  end if;

  insert into public.sales (
    business_id,
    customer_id,
    date,
    customer_name,
    customer_phone,
    customer_address,
    sale_type,
    payment_mode,
    total_amount,
    total_cost,
    total_profit,
    notes,
    sale_tag_id
  ) values (
    v_bid,
    v_customer_id,
    p_date,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    v_customer_phone,
    v_customer_address,
    p_sale_type,
    p_payment_mode,
    0, 0, 0,
    nullif(trim(p_notes), ''),
    p_sale_tag_id
  )
  returning id into v_sale_id;

  for v_elem in
    select elem from jsonb_array_elements(p_lines) with ordinality as t(elem, _ord)
  loop
    v_product_id := (v_elem->>'product_id')::uuid;
    v_qty := (v_elem->>'quantity')::numeric;
    v_sale_price := (v_elem->>'sale_price')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity';
    end if;
    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'Invalid sale_price';
    end if;

    select p.mrp, p.cost_price into v_mrp, v_cost
    from public.products p
    where p.id = v_product_id
      and p.business_id = v_bid
      and p.deleted_at is null;
    if not found then
      raise exception 'Product not found or inactive';
    end if;

    if not exists (
      select 1 from public.product_components pc where pc.product_id = v_product_id
    ) then
      perform public.inventory_apply_delta(v_bid, v_product_id, -v_qty);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = v_product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * v_qty)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock - v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid
      returning current_stock into v_component_stock;

      if v_component_stock is null then
        raise exception 'Component inventory item not found for this business';
      end if;
      if v_component_stock < 0 then
        raise exception 'Insufficient component stock for this sale';
      end if;
    end loop;

    v_vs_mrp := round((v_sale_price - v_mrp)::numeric, 2);
    v_line_profit := round(((v_sale_price - v_cost) * v_qty)::numeric, 2);
    v_line_rev := round((v_sale_price * v_qty)::numeric, 2);
    v_line_cost := round((v_cost * v_qty)::numeric, 2);
    v_total_amount := v_total_amount + v_line_rev;
    v_total_cost := v_total_cost + v_line_cost;

    insert into public.sale_items (
      sale_id, product_id, quantity, sale_price, cost_price_snapshot, mrp_snapshot, vs_mrp, profit
    ) values (
      v_sale_id, v_product_id, v_qty, v_sale_price, v_cost, v_mrp, v_vs_mrp, v_line_profit
    );
  end loop;

  update public.sales
  set
    total_amount = round(v_total_amount, 2),
    total_cost = round(v_total_cost, 2),
    total_profit = round(v_total_amount - v_total_cost, 2)
  where id = v_sale_id
    and business_id = v_bid;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total_amount', (select total_amount from public.sales where id = v_sale_id),
    'total_cost', (select total_cost from public.sales where id = v_sale_id),
    'total_profit', (select total_profit from public.sales where id = v_sale_id)
  );
end;
$$;

revoke all on function public.save_sale(date, text, text, text, jsonb, text, text, text, uuid) from public;
grant execute on function public.save_sale(date, text, text, text, jsonb, text, text, text, uuid) to authenticated;

create or replace function public.update_sale(
  p_sale_id uuid,
  p_date date,
  p_customer_name text,
  p_payment_mode text,
  p_notes text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_sale_type text default null,
  p_sale_tag_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r record;
  v_elem jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_sale_price numeric;
  v_mrp numeric;
  v_cost numeric;
  v_vs_mrp numeric;
  v_line_profit numeric;
  v_total_amount numeric := 0;
  v_total_cost numeric := 0;
  v_line_rev numeric;
  v_line_cost numeric;
  v_customer_phone text;
  v_customer_name text;
  v_customer_address text;
  v_customer_id uuid;
  r_component record;
  v_component_delta numeric;
  v_component_stock numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is null then
    raise exception 'sale_tag_id is required';
  end if;
  if not exists (
    select 1
    from public.sale_tags st
    where st.id = p_sale_tag_id
      and st.business_id = v_bid
      and st.deleted_at is null
  ) then
    raise exception 'Invalid sale tag';
  end if;

  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id and s.business_id = v_bid and s.deleted_at is null
  ) then
    raise exception 'Sale not found, archived, or access denied';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('cash', 'online') then
    raise exception 'Invalid payment_mode';
  end if;
  if p_sale_type is not null and p_sale_type not in ('B2C', 'B2B', 'B2B2C') then
    raise exception 'Invalid sale_type';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item required';
  end if;

  for r in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
  loop
    if not exists (
      select 1 from public.product_components pc where pc.product_id = r.product_id
    ) then
      perform public.inventory_apply_delta(v_bid, r.product_id, r.quantity);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = r.product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * r.quantity)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock + v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid;
    end loop;
  end loop;

  delete from public.sale_items where sale_id = p_sale_id;

  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_customer_name := coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), 'Customer');
  v_customer_address := nullif(trim(coalesce(p_customer_address, '')), '');
  v_customer_id := null;
  if v_customer_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.business_id = v_bid
      and c.phone = v_customer_phone
      and c.deleted_at is null
    limit 1;

    if v_customer_id is null then
      insert into public.customers (business_id, name, phone, address)
      values (v_bid, v_customer_name, v_customer_phone, v_customer_address)
      returning id into v_customer_id;
    else
      update public.customers
      set
        name = v_customer_name,
        address = coalesce(v_customer_address, address)
      where id = v_customer_id
        and business_id = v_bid;
    end if;
  end if;

  update public.sales
  set
    customer_id = v_customer_id,
    date = p_date,
    customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone = v_customer_phone,
    customer_address = v_customer_address,
    sale_type = p_sale_type,
    payment_mode = p_payment_mode,
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    sale_tag_id = p_sale_tag_id,
    total_amount = 0,
    total_cost = 0,
    total_profit = 0
  where id = p_sale_id
    and business_id = v_bid;

  for v_elem in
    select elem from jsonb_array_elements(p_lines) with ordinality as t(elem, _ord)
  loop
    v_product_id := (v_elem->>'product_id')::uuid;
    v_qty := (v_elem->>'quantity')::numeric;
    v_sale_price := (v_elem->>'sale_price')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity';
    end if;
    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'Invalid sale_price';
    end if;

    select p.mrp, p.cost_price into v_mrp, v_cost
    from public.products p
    where p.id = v_product_id
      and p.business_id = v_bid
      and p.deleted_at is null;
    if not found then
      raise exception 'Product not found or inactive';
    end if;

    if not exists (
      select 1 from public.product_components pc where pc.product_id = v_product_id
    ) then
      perform public.inventory_apply_delta(v_bid, v_product_id, -v_qty);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = v_product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * v_qty)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock - v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid
      returning current_stock into v_component_stock;

      if v_component_stock is null then
        raise exception 'Component inventory item not found for this business';
      end if;
      if v_component_stock < 0 then
        raise exception 'Insufficient component stock for this sale';
      end if;
    end loop;

    v_vs_mrp := round((v_sale_price - v_mrp)::numeric, 2);
    v_line_profit := round(((v_sale_price - v_cost) * v_qty)::numeric, 2);
    v_line_rev := round((v_sale_price * v_qty)::numeric, 2);
    v_line_cost := round((v_cost * v_qty)::numeric, 2);
    v_total_amount := v_total_amount + v_line_rev;
    v_total_cost := v_total_cost + v_line_cost;

    insert into public.sale_items (
      sale_id, product_id, quantity, sale_price, cost_price_snapshot, mrp_snapshot, vs_mrp, profit
    ) values (
      p_sale_id, v_product_id, v_qty, v_sale_price, v_cost, v_mrp, v_vs_mrp, v_line_profit
    );
  end loop;

  update public.sales
  set
    total_amount = round(v_total_amount, 2),
    total_cost = round(v_total_cost, 2),
    total_profit = round(v_total_amount - v_total_cost, 2)
  where id = p_sale_id
    and business_id = v_bid;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'total_amount', (select total_amount from public.sales where id = p_sale_id),
    'total_cost', (select total_cost from public.sales where id = p_sale_id),
    'total_profit', (select total_profit from public.sales where id = p_sale_id)
  );
end;
$$;

revoke all on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text, uuid) from public;
grant execute on function public.update_sale(uuid, date, text, text, text, jsonb, text, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- V3 Dashboard RPC: monthly performance (zero-filled)
-- -----------------------------------------------------------------------------
create or replace function public.get_monthly_performance(
  p_from date,
  p_to date,
  p_sale_tag_id uuid default null
)
returns table (
  month int,
  year int,
  revenue numeric(12, 2),
  expenses numeric(12, 2),
  profit numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_start_month date;
  v_end_month date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Date range required';
  end if;
  if p_from > p_to then
    raise exception 'Invalid date range (from > to)';
  end if;

  v_bid := public.current_business_id();
  if v_bid is null then
    raise exception 'No business context';
  end if;

  if p_sale_tag_id is not null then
    if not exists (
      select 1
      from public.sale_tags st
      where st.id = p_sale_tag_id
        and st.business_id = v_bid
        and st.deleted_at is null
    ) then
      raise exception 'Invalid sale tag';
    end if;
  end if;

  v_start_month := date_trunc('month', p_from)::date;
  v_end_month := date_trunc('month', p_to)::date;

  return query
  with month_series as (
    select generate_series(v_start_month::timestamp, v_end_month::timestamp, interval '1 month')::date as month_start
  ),
  sales_monthly as (
    select
      date_trunc('month', s.date::timestamp)::date as month_start,
      sum(s.total_amount)::numeric(12, 2) as revenue
    from public.sales s
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and (p_sale_tag_id is null or s.sale_tag_id = p_sale_tag_id)
    group by 1
  ),
  expense_monthly as (
    select
      date_trunc('month', (e.date::date)::timestamp)::date as month_start,
      sum(e.total_amount)::numeric(12, 2) as amt
    from public.expenses e
    where e.business_id = v_bid
      and e.deleted_at is null
      and (e.date::date) >= p_from
      and (e.date::date) <= p_to
      and p_sale_tag_id is null
    group by 1
  ),
  cogs_monthly as (
    select
      date_trunc('month', s.date::timestamp)::date as month_start,
      sum(round((si.quantity * si.cost_price_snapshot)::numeric, 2))::numeric(12, 2) as amt
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.business_id = v_bid
      and s.deleted_at is null
      and s.date >= p_from
      and s.date <= p_to
      and p_sale_tag_id is not null
      and s.sale_tag_id = p_sale_tag_id
    group by 1
  ),
  cost_or_expense_monthly as (
    select * from expense_monthly
    union all
    select * from cogs_monthly
  )
  select
    extract(month from ms.month_start)::int as month,
    extract(year from ms.month_start)::int as year,
    coalesce(sm.revenue, 0)::numeric(12, 2) as revenue,
    coalesce(ce.amt, 0)::numeric(12, 2) as expenses,
    (coalesce(sm.revenue, 0) - coalesce(ce.amt, 0))::numeric(12, 2) as profit
  from month_series ms
  left join sales_monthly sm on sm.month_start = ms.month_start
  left join cost_or_expense_monthly ce on ce.month_start = ms.month_start
  order by ms.month_start;
end;
$$;

revoke all on function public.get_monthly_performance(date, date, uuid) from public;
grant execute on function public.get_monthly_performance(date, date, uuid) to authenticated;
