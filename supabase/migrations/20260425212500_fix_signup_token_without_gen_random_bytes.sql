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

commit;
