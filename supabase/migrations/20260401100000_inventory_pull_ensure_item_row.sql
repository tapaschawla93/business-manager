-- When the ledger (public.inventory) changes but no inventory_items row exists for that product,
-- the Inventory UI stayed empty even though stock-purchase expenses had updated the ledger.
-- Upsert behavior: UPDATE linked rows; if none matched, INSERT a line from products + ledger qty.

create or replace function public.inventory_pull_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  v_name text;
  v_cost numeric(12, 2);
begin
  update public.inventory_items ii
  set
    current_stock = new.quantity_on_hand,
    updated_at = now()
  where
    ii.business_id = new.business_id
    and ii.product_id = new.product_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    select
      case
        when coalesce(trim(p.variant), '') = '' then trim(p.name)
        else trim(p.name) || ' · ' || trim(p.variant)
      end,
      coalesce(p.cost_price, 0::numeric)::numeric(12, 2)
    into v_name, v_cost
    from public.products p
    where
      p.id = new.product_id
      and p.business_id = new.business_id
      and p.deleted_at is null;

    if
      v_name is not null
      and not exists (
        select 1
        from public.inventory_items ii0
        where
          ii0.business_id = new.business_id
          and ii0.product_id = new.product_id
      )
    then
      insert into public.inventory_items (
        business_id,
        name,
        unit,
        current_stock,
        unit_cost,
        reorder_level,
        product_id
      )
      values (
        new.business_id,
        v_name,
        'pcs',
        new.quantity_on_hand,
        v_cost,
        null,
        new.product_id
      );
    end if;
  end if;

  return new;
end;
$$;
