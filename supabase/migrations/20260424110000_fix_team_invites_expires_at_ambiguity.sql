begin;

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
  returning
    business_invitations.id,
    business_invitations.invited_email,
    business_invitations.expires_at
  into id, invited_email, expires_at;

  return next;
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

commit;
