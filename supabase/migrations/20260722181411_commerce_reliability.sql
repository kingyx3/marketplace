-- Additive commerce reliability primitives. Cleanup of legacy columns/tables is
-- intentionally deferred to a later contract migration.

begin;

-- The B2B invoice function was removed in 20260716213000, but the historical
-- pg_cron job survives until explicitly unscheduled.
do $migration$
begin
  if to_regnamespace('cron') is not null
     and exists (select 1 from cron.job where jobname = 'expire-stale-invoice-orders-hourly') then
    perform cron.unschedule('expire-stale-invoice-orders-hourly');
  end if;
exception
  when undefined_table or undefined_function then
    raise notice 'pg_cron is unavailable; obsolete invoice job is already inactive';
end
$migration$;

alter table public.webhook_events
  alter column processed_at drop not null,
  add column if not exists status text not null default 'received',
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists attempt_count integer not null default 0,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists last_error text,
  add column if not exists dead_letter_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.webhook_events
set status = case when processed_at is null then 'received' else 'processed' end,
    received_at = coalesce(processed_at, now()),
    next_attempt_at = coalesce(processed_at, now()),
    updated_at = coalesce(processed_at, now());

alter table public.webhook_events
  drop constraint if exists webhook_events_status_check,
  add constraint webhook_events_status_check check (
    status in ('received', 'processing', 'processed', 'retryable_failure', 'dead_letter')
  ),
  drop constraint if exists webhook_events_attempt_count_check,
  add constraint webhook_events_attempt_count_check check (attempt_count >= 0);

create index if not exists idx_webhook_events_worker_queue
  on public.webhook_events (next_attempt_at, received_at)
  where status in ('received', 'retryable_failure');

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid references public.payments(id),
  provider text not null default 'hitpay',
  provider_payment_id text,
  idempotency_key text not null unique default gen_random_uuid()::text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null,
  status text not null default 'created' check (
    status in ('created', 'calling_provider', 'provider_succeeded', 'succeeded',
               'failed', 'result_unknown', 'reconciliation_required')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_payment_attempts_order on public.payment_attempts (order_id, created_at desc);
create index idx_payment_attempts_reconciliation
  on public.payment_attempts (next_attempt_at, created_at)
  where status in ('provider_succeeded', 'result_unknown');
create unique index uq_payment_attempts_provider_payment
  on public.payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;

create table public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds(id),
  payment_id uuid not null references public.payments(id),
  provider text not null default 'hitpay',
  provider_refund_id text,
  dedupe_key text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null,
  status text not null default 'created' check (
    status in ('created', 'calling_provider', 'succeeded', 'failed',
               'result_unknown', 'reconciliation_required')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_refund_attempts_payment on public.refund_attempts (payment_id, created_at desc);
create index idx_refund_attempts_reconciliation
  on public.refund_attempts (next_attempt_at, created_at)
  where status in ('result_unknown', 'reconciliation_required');

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'processed', 'retryable_failure', 'dead_letter')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  processed_at timestamptz,
  dead_letter_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbox_events_worker_queue
  on public.outbox_events (next_attempt_at, created_at)
  where status in ('pending', 'retryable_failure');

alter table public.payment_attempts enable row level security;
alter table public.refund_attempts enable row level security;
alter table public.outbox_events enable row level security;

revoke all on table public.payment_attempts from public, anon, authenticated;
revoke all on table public.refund_attempts from public, anon, authenticated;
revoke all on table public.outbox_events from public, anon, authenticated;
grant select, insert, update on table public.payment_attempts to service_role;
grant select, insert, update on table public.refund_attempts to service_role;
grant select, insert, update on table public.outbox_events to service_role;

create function public.settle_order_payment(
  p_order_id uuid,
  p_provider_payment_id text,
  p_provider_charge_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where provider = 'hitpay'
    and provider_payment_id = p_provider_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if v_payment.order_id is distinct from p_order_id then
    raise exception 'payment does not belong to order' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;

  if v_payment.status = 'refunded' then return 'not_payable'; end if;

  if p_amount_cents <> v_payment.amount_cents
     or p_amount_cents <> v_order.total_cents
     or upper(p_currency) <> upper(v_payment.currency)
     or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'payment amount or currency mismatch' using errcode = 'P0001';
  end if;
  if nullif(trim(p_provider_charge_id), '') is null then
    raise exception 'provider charge id is required' using errcode = '22023';
  end if;
  if v_payment.provider_charge_id is not null
     and v_payment.provider_charge_id <> p_provider_charge_id then
    raise exception 'provider charge id mismatch' using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'captured',
      provider_charge_id = p_provider_charge_id,
      captured_at = coalesce(captured_at, now()),
      updated_at = now()
  where id = v_payment.id;

  if v_order.status = 'paid' then
    insert into public.outbox_events (
      topic, aggregate_type, aggregate_id, dedupe_key, payload
    ) values (
      'order.confirmation', 'order', p_order_id,
      'order.confirmation:' || p_order_id::text,
      jsonb_build_object('orderId', p_order_id)
    ) on conflict (dedupe_key) do nothing;
    return 'paid';
  end if;
  if v_order.status <> 'pending_payment' then return 'not_payable'; end if;
  if v_order.checkout_reserved_until is null or v_order.checkout_reserved_until <= now() then
    perform public.release_order_allocation(p_order_id);
    update public.orders set status = 'cancelled', checkout_reserved_until = null
    where id = p_order_id;
    return 'expired';
  end if;

  if exists (
    select 1
    from public.order_items item
    left join public.product_inventory inventory_row
      on inventory_row.product_id = item.product_id and inventory_row.location = 'main'
    where item.order_id = p_order_id
      and (inventory_row.id is null
        or inventory_row.allocated < item.quantity
        or inventory_row.on_hand < item.quantity)
  ) then
    raise exception 'reserved inventory is inconsistent' using errcode = 'P0001';
  end if;

  update public.product_inventory inventory_row
  set allocated = inventory_row.allocated - item.quantity,
      on_hand = inventory_row.on_hand - item.quantity,
      updated_at = now()
  from public.order_items item
  where item.order_id = p_order_id
    and item.product_id = inventory_row.product_id
    and inventory_row.location = 'main';

  update public.orders
  set status = 'paid', checkout_reserved_until = null, placed_at = coalesce(placed_at, now()),
      updated_at = now()
  where id = p_order_id;

  insert into public.outbox_events (
    topic, aggregate_type, aggregate_id, dedupe_key, payload
  ) values (
    'order.confirmation', 'order', p_order_id,
    'order.confirmation:' || p_order_id::text,
    jsonb_build_object('orderId', p_order_id)
  ) on conflict (dedupe_key) do nothing;

  return 'paid';
end;
$$;

revoke all on function public.settle_order_payment(uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_order_payment(uuid, text, text, integer, text)
  to service_role;

-- Expand/contract compatibility for the application version that is still
-- serving while this migration is applied. A later cleanup migration may drop
-- this overload after every deployment uses the charge-aware signature.
create or replace function public.settle_order_payment(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_charge_id text;
begin
  select provider_charge_id into v_provider_charge_id
  from public.payments
  where provider = 'hitpay' and provider_payment_id = p_provider_payment_id;
  if v_provider_charge_id is null then
    raise exception 'provider charge id is required' using errcode = '22023';
  end if;
  return public.settle_order_payment(
    p_order_id,
    p_provider_payment_id,
    v_provider_charge_id,
    p_amount_cents,
    p_currency
  );
end;
$$;

revoke all on function public.settle_order_payment(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_order_payment(uuid, text, integer, text)
  to service_role;

create or replace function public.claim_payment_attempts(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 90
)
returns table (
  id uuid,
  order_id uuid,
  payment_id uuid,
  provider_payment_id text,
  amount_cents integer,
  currency text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.payment_attempts attempt
  set status = 'reconciliation_required',
      locked_at = now(),
      locked_by = p_worker_id,
      attempt_count = attempt.attempt_count + 1,
      updated_at = now()
  where attempt.id in (
    select candidate.id
    from public.payment_attempts candidate
    where candidate.provider_payment_id is not null
      and (
        candidate.status in ('provider_succeeded', 'result_unknown')
        or (candidate.status = 'reconciliation_required'
          and candidate.locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds)))
      )
      and candidate.next_attempt_at <= now()
    order by candidate.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  returning attempt.id, attempt.order_id, attempt.payment_id,
            attempt.provider_payment_id, attempt.amount_cents, attempt.currency;
$$;

revoke all on function public.claim_payment_attempts(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_payment_attempts(text, integer, integer)
  to service_role;

create or replace function public.claim_webhook_events(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 90
)
returns table (id uuid, event_type text, payload jsonb)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.webhook_events event
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempt_count = event.attempt_count + 1,
      updated_at = now()
  where event.id in (
    select candidate.id
    from public.webhook_events candidate
    where (
      candidate.status in ('received', 'retryable_failure')
      or (candidate.status = 'processing'
        and candidate.locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds)))
    )
      and candidate.processed_at is null
      and candidate.next_attempt_at <= now()
    order by candidate.received_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  returning event.id, event.event_type, event.payload;
$$;

create or replace function public.complete_webhook_event(p_event_id uuid, p_worker_id text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.webhook_events
  set status = 'processed', processed_at = now(), locked_at = null, locked_by = null,
      last_error = null, updated_at = now()
  where id = p_event_id and status = 'processing' and locked_by = p_worker_id;
$$;

create or replace function public.fail_webhook_event(
  p_event_id uuid, p_worker_id text, p_error text, p_max_attempts integer default 10
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.webhook_events
  set status = case when attempt_count >= greatest(1, p_max_attempts)
                    then 'dead_letter' else 'retryable_failure' end,
      dead_letter_at = case when attempt_count >= greatest(1, p_max_attempts) then now() end,
      next_attempt_at = now() + make_interval(secs => least(3600, 5 * (2 ^ least(attempt_count, 9))::integer)),
      locked_at = null, locked_by = null, last_error = left(p_error, 2000), updated_at = now()
  where id = p_event_id and status = 'processing' and locked_by = p_worker_id;
end;
$$;

create or replace function public.claim_outbox_events(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 90
)
returns table (id uuid, topic text, aggregate_id uuid, payload jsonb)
language sql security definer set search_path = public, pg_temp as $$
  update public.outbox_events event
  set status = 'processing', locked_at = now(), locked_by = p_worker_id,
      attempt_count = event.attempt_count + 1, updated_at = now()
  where event.id in (
    select candidate.id from public.outbox_events candidate
    where (
      candidate.status in ('pending', 'retryable_failure')
      or (candidate.status = 'processing'
        and candidate.locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds)))
    ) and candidate.next_attempt_at <= now()
    order by candidate.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  returning event.id, event.topic, event.aggregate_id, event.payload;
$$;

create or replace function public.complete_outbox_event(p_event_id uuid, p_worker_id text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.outbox_events
  set status = 'processed', processed_at = now(), locked_at = null, locked_by = null,
      last_error = null, updated_at = now()
  where id = p_event_id and status = 'processing' and locked_by = p_worker_id;
$$;

create or replace function public.fail_outbox_event(
  p_event_id uuid, p_worker_id text, p_error text, p_max_attempts integer default 10
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.outbox_events
  set status = case when attempt_count >= greatest(1, p_max_attempts)
                    then 'dead_letter' else 'retryable_failure' end,
      dead_letter_at = case when attempt_count >= greatest(1, p_max_attempts) then now() end,
      next_attempt_at = now() + make_interval(secs => least(3600, 5 * (2 ^ least(attempt_count, 9))::integer)),
      locked_at = null, locked_by = null, last_error = left(p_error, 2000), updated_at = now()
  where id = p_event_id and status = 'processing' and locked_by = p_worker_id;
end;
$$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.claim_webhook_events(text,integer,integer)',
    'public.complete_webhook_event(uuid,text)',
    'public.fail_webhook_event(uuid,text,text,integer)',
    'public.claim_outbox_events(text,integer,integer)',
    'public.complete_outbox_event(uuid,text)',
    'public.fail_outbox_event(uuid,text,text,integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

commit;
