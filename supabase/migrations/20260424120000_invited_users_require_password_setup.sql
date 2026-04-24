begin;

alter table public.profiles
  add column if not exists password_setup_required boolean not null default false;

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

revoke all on function public.mark_password_setup_complete() from public;
grant execute on function public.mark_password_setup_complete() to authenticated;
grant execute on function public.accept_business_invitation_for_current_user() to authenticated;

commit;
