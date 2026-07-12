-- Run invoice-allocation expiry inside Postgres so Vercel Hobby does not need
-- a sub-daily Vercel Cron Job. The named job is idempotent: scheduling it again
-- replaces the existing definition instead of creating a duplicate.

create extension if not exists pg_cron schema pg_catalog;

select cron.schedule(
  'expire-stale-invoice-orders-hourly',
  '7 * * * *',
  $$select public.expire_stale_invoice_orders(500);$$
);
