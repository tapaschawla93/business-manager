-- 1) Deleting inventory_items: remove BOM rows that reference the item (CASCADE).
-- 2) Dashboard "archive" RPCs become permanent DELETE (sales, products, expenses, vendors).
-- 3) customers: fix UPDATE WITH CHECK + allow DELETE; sales.customer_id SET NULL on customer delete.
-- 4) Tag/vendor FKs SET NULL so hard deletes do not trap rows.
-- 5) sale_tags DELETE policy; optional client fallback can delete sale lines + header after stock restore.

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------
alter table public.product_components
  drop constraint if exists product_components_inventory_item_id_fkey;

alter table public.product_components
  add constraint product_components_inventory_item_id_fkey
  foreign key (inventory_item_id) references public.inventory_items (id) on delete cascade;

alter table public.sales
  drop constraint if exists sales_customer_id_fkey;

alter table public.sales
  add constraint sales_customer_id_fkey
  foreign key (customer_id) references public.customers (id) on delete set null;

alter table public.expenses
  drop constraint if exists expenses_vendor_id_fkey;

alter table public.expenses
  add constraint expenses_vendor_id_fkey
  foreign key (vendor_id) references public.vendors (id) on delete set null;

alter table public.sales
  drop constraint if exists sales_sale_tag_id_fkey;

alter table public.sales
  add constraint sales_sale_tag_id_fkey
  foreign key (sale_tag_id) references public.sale_tags (id) on delete set null;

alter table public.expenses
  drop constraint if exists expenses_expense_tag_id_fkey;

alter table public.expenses
  add constraint expenses_expense_tag_id_fkey
  foreign key (expense_tag_id) references public.sale_tags (id) on delete set null;

alter table public.businesses
  drop constraint if exists businesses_default_sale_tag_id_fkey;

alter table public.businesses
  add constraint businesses_default_sale_tag_id_fkey
  foreign key (default_sale_tag_id) references public.sale_tags (id) on delete set null;

-- -----------------------------------------------------------------------------
-- customers RLS: align WITH CHECK with vendors/products; allow DELETE
-- -----------------------------------------------------------------------------
drop policy if exists "customers_update" on public.customers;
create policy "customers_update"
  on public.customers
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.business_id = business_id
    )
  );

drop policy if exists "customers_delete" on public.customers;
create policy "customers_delete"
  on public.customers
  for delete
  using (business_id = public.current_business_id());

-- -----------------------------------------------------------------------------
-- sale_tags: authenticated may DELETE own tenant rows
-- -----------------------------------------------------------------------------
drop policy if exists "sale_tags_delete" on public.sale_tags;
create policy "sale_tags_delete"
  on public.sale_tags
  for delete
  using (business_id = public.current_business_id());

grant delete on public.sale_tags to authenticated;

-- -----------------------------------------------------------------------------
-- Client fallback for sale removal (after inventory restore): delete lines then header
-- -----------------------------------------------------------------------------
drop policy if exists "sale_items_delete" on public.sale_items;
create policy "sale_items_delete"
  on public.sale_items
  for delete
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_items.sale_id
        and s.business_id = public.current_business_id()
    )
  );

drop policy if exists "sales_delete" on public.sales;
create policy "sales_delete"
  on public.sales
  for delete
  using (business_id = public.current_business_id());

-- -----------------------------------------------------------------------------
-- archive_product → hard delete (active row only)
-- -----------------------------------------------------------------------------
create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  if not exists (
    select 1
    from public.products pr
    where pr.id = p_product_id
      and pr.business_id = v_bid
      and pr.deleted_at is null
  ) then
    raise exception 'Product not found, already archived, or access denied';
  end if;

  if exists (
    select 1 from public.sale_items si where si.product_id = p_product_id
  ) then
    raise exception 'Cannot delete product: it is referenced by sales lines. Remove or change those sales first.';
  end if;

  if exists (
    select 1
    from public.expenses e
    where e.product_id = p_product_id
      and e.business_id = v_bid
      and e.deleted_at is null
  ) then
    raise exception 'Cannot delete product: it is referenced by active expenses.';
  end if;

  update public.inventory_items
  set product_id = null, updated_at = now()
  where product_id = p_product_id
    and business_id = v_bid;

  delete from public.inventory
  where product_id = p_product_id
    and business_id = v_bid;

  delete from public.products
  where id = p_product_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Product not found, already archived, or access denied';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- archive_expense → hard delete + reverse ledger stock-in when applicable
-- -----------------------------------------------------------------------------
create or replace function public.archive_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r public.expenses%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  select * into r
  from public.expenses e
  where e.id = p_expense_id
    and e.business_id = v_bid
    and e.deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;

  if r.update_inventory and r.product_id is not null then
    perform public.inventory_apply_delta_for_tenant(
      v_bid,
      r.product_id,
      -(r.quantity)::numeric
    );
  end if;

  delete from public.expenses
  where id = p_expense_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Expense not found, already archived, or access denied';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- archive_vendor → hard delete (expenses.vendor_id nulls via FK)
-- -----------------------------------------------------------------------------
create or replace function public.archive_vendor(p_vendor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  delete from public.vendors
  where id = p_vendor_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Vendor not found, already archived, or access denied';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- archive_sale → restore stock then delete lines + header
-- -----------------------------------------------------------------------------
create or replace function public.archive_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  r record;
  r_component record;
  v_component_delta numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.business_id into v_bid
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;

  if v_bid is null then
    raise exception 'No business context';
  end if;

  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id and s.business_id = v_bid and s.deleted_at is null
  ) then
    raise exception 'Sale not found, already archived, or access denied';
  end if;

  for r in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
  loop
    if not exists (
      select 1 from public.product_components pc where pc.product_id = r.product_id
    ) then
      perform public.inventory_apply_delta(v_bid, r.product_id, r.quantity);
    end if;

    for r_component in
      select pc.inventory_item_id, pc.quantity_per_unit
      from public.product_components pc
      where pc.product_id = r.product_id
    loop
      v_component_delta := round((r_component.quantity_per_unit * r.quantity)::numeric, 3);
      update public.inventory_items ii
      set
        current_stock = round((ii.current_stock + v_component_delta)::numeric, 3),
        updated_at = now()
      where ii.id = r_component.inventory_item_id
        and ii.business_id = v_bid;
    end loop;
  end loop;

  delete from public.sale_items where sale_id = p_sale_id;
  delete from public.sales
  where id = p_sale_id
    and business_id = v_bid
    and deleted_at is null;

  if not found then
    raise exception 'Sale not found, already archived, or access denied';
  end if;
end;
$$;
