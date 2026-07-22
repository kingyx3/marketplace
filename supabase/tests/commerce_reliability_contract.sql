\set ON_ERROR_STOP on

do $test$
declare
  v_definition text;
begin
  if to_regclass('public.payment_attempts') is null
     or to_regclass('public.refund_attempts') is null
     or to_regclass('public.outbox_events') is null then
    raise exception 'durable commerce attempt/outbox tables are missing';
  end if;

  if to_regprocedure('public.settle_order_payment(uuid,text,text,integer,text)') is null then
    raise exception 'atomic order settlement function is missing';
  end if;
  if to_regprocedure('public.claim_payment_attempts(text,integer,integer)') is null
     or to_regprocedure('public.claim_webhook_events(text,integer,integer)') is null
     or to_regprocedure('public.claim_outbox_events(text,integer,integer)') is null then
    raise exception 'commerce worker lease functions are missing';
  end if;
  select pg_get_functiondef('public.settle_order_payment(uuid,text,text,integer,text)'::regprocedure)
    into v_definition;
  if position('update public.payments' in lower(v_definition)) = 0
     or position('update public.orders' in lower(v_definition)) = 0
     or position('update public.product_inventory' in lower(v_definition)) = 0
     or position('insert into public.outbox_events' in lower(v_definition)) = 0 then
    raise exception 'settlement does not atomically cover payment, order, inventory, and outbox';
  end if;

  if to_regprocedure('public.expire_stale_invoice_orders(integer)') is not null then
    raise exception 'obsolete invoice expiry function is active';
  end if;

  if to_regnamespace('cron') is not null
     and exists (select 1 from cron.job where jobname = 'expire-stale-invoice-orders-hourly') then
    raise exception 'obsolete invoice expiry cron job is still scheduled';
  end if;
end
$test$;
