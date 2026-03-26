-- Soft-delete archives: UPDATE must use an explicit WITH CHECK that does NOT require deleted_at IS NULL
-- on the new row. If WITH CHECK is omitted, PostgreSQL uses the USING clause for both phases, which
-- blocks SET deleted_at (new row fails deleted_at IS NULL).

drop policy if exists "products_update" on public.products;

create policy "products_update"
  on public.products
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (business_id = public.current_business_id());

drop policy if exists "expenses_update" on public.expenses;

create policy "expenses_update"
  on public.expenses
  for update
  using (
    business_id = public.current_business_id()
    and deleted_at is null
  )
  with check (business_id = public.current_business_id());
