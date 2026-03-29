-- Reject cross-tenant cost sync (same guard as inventory_apply_delta_for_tenant).

create or replace function public.sync_product_cost_from_expense(
  p_business_id uuid,
  p_product_id uuid,
  p_unit_cost numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is distinct from public.current_business_id() then
    raise exception 'Business mismatch';
  end if;
  update public.products
    set cost_price = p_unit_cost, updated_at = now()
    where id = p_product_id and business_id = p_business_id;

  update public.inventory_items
    set unit_cost = p_unit_cost, updated_at = now()
    where product_id = p_product_id and business_id = p_business_id;
end;
$$;
