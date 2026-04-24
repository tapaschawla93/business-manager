-- Products: allow same name with different variants (active rows only).
-- Unique identity becomes (business_id, name, coalesce(variant,'')) where deleted_at is null.

drop index if exists public.products_business_id_name_active_uidx;

create unique index if not exists products_business_id_name_variant_active_uidx
  on public.products (business_id, name, coalesce(variant, ''))
  where deleted_at is null;

comment on index public.products_business_id_name_variant_active_uidx is
  'One active product per (name, variant) per business; archived rows may reuse keys. Variant null treated as empty.';

