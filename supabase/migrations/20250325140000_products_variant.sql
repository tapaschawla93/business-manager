-- UP: Optional product variant (free text), UI + API; RLS unchanged.

alter table public.products
  add column if not exists variant text;

-- DOWN (manual)
-- alter table public.products drop column if exists variant;
