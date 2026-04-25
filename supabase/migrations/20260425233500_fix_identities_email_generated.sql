begin;

drop function if exists public.manual_approve_signup_request(uuid, text);

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

grant execute on function public.manual_approve_signup_request(uuid, text) to authenticated;

commit;
