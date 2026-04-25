begin;

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

commit;
