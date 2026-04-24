begin;

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

revoke all on function public.get_current_user_onboarding_gate() from public;
grant execute on function public.get_current_user_onboarding_gate() to authenticated;

commit;
