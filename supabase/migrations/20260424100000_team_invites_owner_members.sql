-- Team invites + multi-member businesses

begin;

alter table public.profiles
  drop constraint if exists profiles_business_id_key;

alter table public.businesses
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

update public.businesses b
set owner_user_id = p.id
from public.profiles p
where p.business_id = b.id
  and p.deleted_at is null
  and b.owner_user_id is null;

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

alter table public.business_invitations enable row level security;

revoke all on table public.business_invitations from public;
grant select, insert, update on table public.business_invitations to authenticated;

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

  select count(*)
    into v_pending_count
  from public.business_invitations bi
  where bi.business_id = v_business_id
    and bi.status = 'pending'
    and bi.expires_at > now();

  if v_pending_count >= 3 then
    raise exception 'Maximum of 3 pending invites reached';
  end if;

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

  insert into public.business_invitations (business_id, invited_email, invited_email_norm, invited_by)
  values (v_business_id, v_email, v_email_norm, auth.uid())
  returning business_invitations.id, business_invitations.invited_email, business_invitations.expires_at
  into id, invited_email, expires_at;

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

  insert into public.profiles (id, business_id)
  values (auth.uid(), v_invite.business_id)
  on conflict (id) do update
    set business_id = excluded.business_id,
        deleted_at = null;

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
        deleted_at = null;

  return v_business_id;
end;
$$;

revoke all on function public.is_current_user_business_owner(uuid) from public;
revoke all on function public.create_business_invitation(text) from public;
revoke all on function public.list_business_members() from public;
revoke all on function public.list_business_pending_invitations() from public;
revoke all on function public.revoke_business_invitation(uuid) from public;
revoke all on function public.remove_business_member(uuid) from public;
revoke all on function public.accept_business_invitation_for_current_user() from public;

grant execute on function public.is_current_user_business_owner(uuid) to authenticated;
grant execute on function public.create_business_invitation(text) to authenticated;
grant execute on function public.list_business_members() to authenticated;
grant execute on function public.list_business_pending_invitations() to authenticated;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;
grant execute on function public.remove_business_member(uuid) to authenticated;
grant execute on function public.accept_business_invitation_for_current_user() to authenticated;
grant execute on function public.create_business_for_user(text) to authenticated;

commit;
