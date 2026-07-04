-- Harden admin order/payment operations with explicit, audited actions.
-- This removes the need for generic admin status writes that can bypass the
-- payment state machine.

create table if not exists public.payment_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  exception_type text not null check (
    exception_type in (
      'webhook_processing_failure',
      'amount_currency_mismatch',
      'orphan_provider_payment',
      'stale_pending_payment',
      'failed_payment_allocation',
      'manual_flag'
    )
  ),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detail text not null,
  actor text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_exceptions_target check (order_id is not null or payment_id is not null)
);

alter table public.payment_exceptions enable row level security;

drop trigger if exists set_updated_at on public.payment_exceptions;
create trigger set_updated_at before update on public.payment_exceptions
  for each row execute function public.set_updated_at();

drop trigger if exists audit_log on public.payment_exceptions;
create trigger audit_log after insert or update or delete on public.payment_exceptions
  for each row execute function public.write_audit_log();

create index if not exists idx_payment_exceptions_status_created
  on public.payment_exceptions(status, created_at desc);
create index if not exists idx_payment_exceptions_order
  on public.payment_exceptions(order_id)
  where order_id is not null;
create index if not exists idx_payment_exceptions_payment
  on public.payment_exceptions(payment_id)
  where payment_id is not null;

grant select, insert, update, delete on table public.payment_exceptions to service_role;
revoke all on table public.payment_exceptions from anon, authenticated;

create or replace function public.admin_flag_payment_exception(
  p_order_id uuid,
  p_payment_id uuid,
  p_exception_type text,
  p_detail text,
  p_actor text,
  p_severity text default 'warning'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exception_id uuid;
begin
  if p_order_id is null and p_payment_id is null then
    raise exception 'payment exception target required' using errcode = '22023';
  end if;

  if nullif(trim(p_detail), '') is null then
    raise exception 'payment exception detail required' using errcode = '22023';
  end if;

  if nullif(trim(p_actor), '') is null then
    raise exception 'payment exception actor required' using errcode = '22023';
  end if;

  insert into public.payment_exceptions (
    order_id,
    payment_id,
    exception_type,
    severity,
    detail,
    actor
  )
  values (
    p_order_id,
    p_payment_id,
    p_exception_type,
    coalesce(nullif(trim(p_severity), ''), 'warning'),
    trim(p_detail),
    trim(p_actor)
  )
  returning id into v_exception_id;

  return v_exception_id;
end;
$$;

revoke all on function public.admin_flag_payment_exception(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.admin_flag_payment_exception(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to service_role;

create or replace function public.admin_mark_order_packing(
  p_order_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('paid', 'packing') then
    raise exception 'order must be paid before packing' using errcode = 'P0001';
  end if;

  if v_status <> 'packing' then
    update public.orders
       set status = 'packing'
     where id = p_order_id;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'orders',
    p_order_id::text,
    'ADMIN_MARK_PACKING',
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'packing')
  );
end;
$$;

revoke all on function public.admin_mark_order_packing(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_order_packing(uuid, text) to service_role;

create or replace function public.admin_ship_order(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if nullif(trim(p_carrier), '') is null or nullif(trim(p_tracking_number), '') is null then
    raise exception 'carrier and tracking number required' using errcode = '22023';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('paid', 'packing') then
    raise exception 'order not shippable' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'shipped'
   where id = p_order_id;

  insert into public.shipments (
    order_id,
    carrier,
    tracking_number,
    status,
    shipped_at
  )
  values (
    p_order_id,
    trim(p_carrier),
    trim(p_tracking_number),
    'in_transit',
    now()
  );

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'orders',
    p_order_id::text,
    'ADMIN_SHIP_ORDER',
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'shipped', 'carrier', trim(p_carrier), 'tracking_number', trim(p_tracking_number))
  );
end;
$$;

revoke all on function public.admin_ship_order(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_ship_order(uuid, text, text, text)
  to service_role;

create or replace function public.admin_cancel_unpaid_order(
  p_order_id uuid,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'cancellation reason required' using errcode = '22023';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('draft', 'pending_payment') then
    raise exception 'only unpaid orders can be cancelled by this action' using errcode = 'P0001';
  end if;

  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';

  update public.payments
     set status = 'cancelled'
   where order_id = p_order_id
     and status in ('pending', 'requires_capture', 'authorized');

  update public.orders
     set status = 'cancelled'
   where id = p_order_id;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'orders',
    p_order_id::text,
    'ADMIN_CANCEL_UNPAID_ORDER',
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.admin_cancel_unpaid_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_cancel_unpaid_order(uuid, text, text)
  to service_role;

create or replace function public.admin_record_manual_reconciliation(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_total_cents integer;
  v_currency text;
  v_payment_id uuid;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'manual reconciliation reason required' using errcode = '22023';
  end if;

  if nullif(trim(p_provider), '') is null or nullif(trim(p_provider_payment_id), '') is null then
    raise exception 'provider and payment reference required' using errcode = '22023';
  end if;

  select status, total_cents, upper(currency)
    into v_status, v_total_cents, v_currency
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending_payment', 'paid') then
    raise exception 'order not reconcilable' using errcode = 'P0001';
  end if;

  if p_amount_cents is null or p_amount_cents <> v_total_cents then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> v_currency then
    raise exception 'payment currency mismatch' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.payments existing
    where existing.order_id = p_order_id
      and existing.status = 'captured'
      and (
        existing.provider <> lower(trim(p_provider))
        or existing.provider_payment_id <> trim(p_provider_payment_id)
      )
  ) then
    raise exception 'order already has a captured payment' using errcode = 'P0001';
  end if;

  insert into public.payments (
    order_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status,
    captured_at
  )
  values (
    p_order_id,
    lower(trim(p_provider)),
    trim(p_provider_payment_id),
    'full',
    p_amount_cents,
    upper(p_currency),
    'captured',
    now()
  )
  on conflict (provider, provider_payment_id) do update
    set amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = 'captured',
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at),
        updated_at = now()
    where public.payments.order_id = excluded.order_id
      and public.payments.preorder_id is null
  returning public.payments.id into v_payment_id;

  if v_payment_id is null then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;

  if v_status <> 'paid' then
    update public.orders
       set status = 'paid'
     where id = p_order_id;

    update public.inventory i
       set allocated = greatest(0, i.allocated - oi.quantity),
           on_hand = greatest(0, i.on_hand - oi.quantity)
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.sku_id = i.sku_id
       and i.location = 'main';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'orders',
    p_order_id::text,
    'ADMIN_MANUAL_RECONCILIATION',
    jsonb_build_object('status', v_status),
    jsonb_build_object(
      'status',
      'paid',
      'provider',
      lower(trim(p_provider)),
      'provider_payment_id',
      trim(p_provider_payment_id),
      'amount_cents',
      p_amount_cents,
      'currency',
      upper(p_currency),
      'reason',
      trim(p_reason)
    )
  );
end;
$$;

revoke all on function public.admin_record_manual_reconciliation(
  uuid,
  text,
  text,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.admin_record_manual_reconciliation(
  uuid,
  text,
  text,
  integer,
  text,
  text,
  text
) to service_role;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_status public.order_status;
  v_total_cents integer;
  v_currency text;
  v_payment_id uuid;
begin
  select customer_id, status, total_cents, upper(currency)
    into v_customer_id, v_status, v_total_cents, v_currency
  from public.orders
  where id = p_order_id
  for update;

  if v_customer_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending_payment', 'paid') then
    raise exception 'order not payable' using errcode = 'P0001';
  end if;

  if p_amount_cents is null or p_amount_cents <> v_total_cents then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> v_currency then
    raise exception 'payment currency mismatch' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.payments existing
    where existing.order_id = p_order_id
      and existing.status = 'captured'
      and (
        existing.provider <> 'stripe'
        or existing.provider_payment_id <> p_provider_payment_id
      )
  ) then
    raise exception 'order already has a captured payment' using errcode = 'P0001';
  end if;

  insert into public.payments (
    order_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status,
    captured_at
  )
  values (
    p_order_id,
    'stripe',
    p_provider_payment_id,
    'full',
    p_amount_cents,
    upper(p_currency),
    'captured',
    now()
  )
  on conflict (provider, provider_payment_id) do update
    set amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = 'captured',
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at),
        updated_at = now()
    where public.payments.order_id = excluded.order_id
      and public.payments.preorder_id is null
  returning public.payments.id into v_payment_id;

  if v_payment_id is null then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;

  if v_status = 'paid' then
    return;
  end if;

  update public.orders
     set status = 'paid'
   where id = p_order_id;

  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity),
         on_hand = greatest(0, i.on_hand - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, integer, text)
  to service_role;

drop function if exists public.ship_order(uuid, text, text);
