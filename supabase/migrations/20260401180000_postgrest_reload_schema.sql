-- Refresh PostgREST schema cache after deploying new RPCs (e.g. archive_sale, update_sale).
select pg_notify('pgrst', 'reload schema');
