-- Run invoice-allocation expiry inside Postgres so Vercel Hobby does not need
-- a sub-daily Vercel Cron Job. Hosted Supabase provides pg_cron, while the
-- lightweight PostgreSQL image used by repository CI may not install it.
-- Skip scheduling only when the extension is genuinely unavailable.

do $migration$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'pg_cron'
  ) then
    execute 'create extension if not exists pg_cron schema pg_catalog';
    execute $schedule$
      select cron.schedule(
        'expire-stale-invoice-orders-hourly',
        '7 * * * *',
        $job$select public.expire_stale_invoice_orders(500);$job$
      )
    $schedule$;
  else
    raise notice 'pg_cron is unavailable; skipping invoice expiry schedule';
  end if;
end
$migration$;
