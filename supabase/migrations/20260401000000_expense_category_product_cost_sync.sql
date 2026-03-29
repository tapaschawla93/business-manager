-- Expense category (non-inventory labeling) + RPC to align catalog costs from stock purchases.

alter table public.expenses
  add column if not exists category text;

comment on column public.expenses.category is
  'Optional label for non-inventory spend (e.g. Marketing, Rent). Null for stock purchases.';

-- When update_inventory = true and product_id is set on an expense, the app calls this after
-- insert/update so products.cost_price and inventory_items.unit_cost match the latest unit cost.
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
  update public.products
    set cost_price = p_unit_cost, updated_at = now()
    where id = p_product_id and business_id = p_business_id;

  update public.inventory_items
    set unit_cost = p_unit_cost, updated_at = now()
    where product_id = p_product_id and business_id = p_business_id;
end;
$$;

revoke all on function public.sync_product_cost_from_expense(uuid, uuid, numeric) from public;
grant execute on function public.sync_product_cost_from_expense(uuid, uuid, numeric) to authenticated;
