-- Expenses V1: tenant table, soft delete, RLS (insert/select/update only).

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  date timestamptz not null default now(),
  vendor_name text not null,
  item_description text not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_cost numeric(10, 2) not null check (unit_cost >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  payment_mode text not null check (payment_mode in ('cash', 'online')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_business_id_idx on public.expenses (business_id);

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
  with check (business_id = public.current_business_id());
