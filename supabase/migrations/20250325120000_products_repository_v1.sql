-- UP: V1 Product Repository — products table + RLS (run if schema.sql was applied before products existed)

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null,
  category text not null,
  mrp numeric(12, 2) not null,
  cost_price numeric(12, 2) not null,
  hsn_code text,
  tax_pct numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_business_id_name_key unique (business_id, name),
  constraint products_mrp_nonneg check (mrp >= 0),
  constraint products_cost_price_nonneg check (cost_price >= 0),
  constraint products_tax_pct_range check (
    tax_pct is null or (tax_pct >= 0 and tax_pct <= 100)
  )
);

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
  using (business_id = public.current_business_id());

create policy "products_insert"
  on public.products
  for insert
  with check (business_id = public.current_business_id());

create policy "products_update"
  on public.products
  for update
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy "products_delete"
  on public.products
  for delete
  using (business_id = public.current_business_id());

-- DOWN (optional manual rollback)
-- drop table if exists public.products;
