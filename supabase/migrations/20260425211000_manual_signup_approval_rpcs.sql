begin;

create or replace function public.create_signup_request(
  p_email text,
  p_business_name text,
  p_password_ciphertext text
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
  if coalesce(trim(p_password_ciphertext), '') = '' then
    raise exception 'Password payload is required';
  end if;
  v_email_norm := lower(v_email);

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
    p_password_ciphertext,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.manual_approve_signup_request(
  p_request_id uuid,
  p_auth_user_id uuid,
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

  insert into public.businesses (name, owner_user_id)
  values (v_req.business_name, p_auth_user_id)
  returning id into v_business_id;

  insert into public.sale_tags (business_id, label)
  values (v_business_id, 'General')
  returning id into v_tag_id;

  update public.businesses
  set default_sale_tag_id = v_tag_id
  where id = v_business_id;

  insert into public.profiles (id, business_id, password_setup_required, deleted_at)
  values (p_auth_user_id, v_business_id, false, null)
  on conflict (id) do update
    set business_id = excluded.business_id,
        password_setup_required = false,
        deleted_at = null;

  update public.signup_requests
  set status = 'approved',
      decided_by = coalesce(nullif(trim(p_decided_by), ''), 'administrator'),
      approved_auth_user_id = p_auth_user_id
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
revoke all on function public.manual_approve_signup_request(uuid, uuid, text) from public;
revoke all on function public.manual_reject_signup_request(uuid, text, text) from public;

grant execute on function public.create_signup_request(text, text, text) to anon, authenticated;
grant execute on function public.manual_approve_signup_request(uuid, uuid, text) to authenticated;
grant execute on function public.manual_reject_signup_request(uuid, text, text) to authenticated;

commit;
