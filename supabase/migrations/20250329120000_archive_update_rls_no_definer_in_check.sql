-- Archive (soft delete) fixes:
-- 1) WITH CHECK using SECURITY DEFINER current_business_id() can fail in some Postgres/Supabase
--    configurations; use an invoker-visible EXISTS against profiles instead.
-- 2) Clients must not chain .select() on PATCH for archive: RETURNING rows must satisfy SELECT
--    policies; products_select / expenses_select require deleted_at IS NULL, so returning an
--    archived row fails. (Handled in app — use update without select.)

drop policy if exists "products_update" on public.products;

create policy "products_update"
  on public.products
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

drop policy if exists "expenses_update" on public.expenses;

create policy "expenses_update"
  on public.expenses
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
