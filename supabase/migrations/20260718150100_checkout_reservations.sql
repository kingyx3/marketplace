-- Reserve normal-order stock for 15 minutes while payment is in progress.

create or replace function public.set_checkout_reservation_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending_payment' then
    if new.checkout_reserved_until is null then
      new.checkout_reserved_until := now() + interval '15 minutes';
    end if;
  else
    new.checkout_reserved_until := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_checkout_reservation_deadline() from public, anon, authenticated;
grant execute on function public.set_checkout_reservation_deadline() to service_role;

drop trigger if exists set_checkout_reservation_deadline on public.orders;
create trigger set_checkout_reservation_deadline
  before insert or update of status, checkout_reserved_until on public.orders
  for each row execute function public.set_checkout_reservation_deadline();

create or replace function public.expire_checkout_reservations(p_limit integer default 500)
returns table (order_id uuid, provider_payment_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'expiry limit must be between 1 and 5000' using errcode = '22023';
  end if;

  for v_order in
    select o.id
    from public.orders o
    where o.status = 'pending_payment'
      and o.checkout_reserved_until is not null
      and o.checkout_reserved_until <= now()
    order by o.checkout_reserved_until, o.id
    for update skip locked
    limit p_limit
  loop
    update public.inventory i
       set allocated = greatest(0, i.allocated - oi.quantity)
      from public.order_items oi
     where oi.order_id = v_order.id
       and oi.sku_id = i.sku_id
       and i.location = 'main';

    update public.payments p
       set status = 'cancelled'
     where p.order_id = v_order.id
       and p.status in ('pending', 'requires_capture', 'authorized');

    update public.orders
       set status = 'cancelled',
           checkout_reserved_until = null
     where id = v_order.id
       and status = 'pending_payment';

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      'system:checkout-expiry',
      'orders',
      v_order.id::text,
      'CHECKOUT_RESERVATION_EXPIRED',
      jsonb_build_object('order_id', v_order.id)
    );

    return query
    select v_order.id, p.provider_payment_id
    from public.payments p
    where p.order_id = v_order.id
      and p.provider = 'stripe'
    order by p.created_at desc
    limit 1;
  end loop;
end;
$$;

revoke all on function public.expire_checkout_reservations(integer) from public, anon, authenticated;
grant execute on function public.expire_checkout_reservations(integer) to service_role;

-- Hosted Supabase includes pg_cron. Repository CI intentionally uses a plain
-- PostgreSQL image, so scheduling is skipped only when the extension is absent.
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
        'expire-checkout-reservations-every-minute',
        '* * * * *',
        $job$select public.expire_checkout_reservations(500);$job$
      )
    $schedule$;
  else
    raise notice 'pg_cron is unavailable; skipping checkout reservation schedule';
  end if;
end
$migration$;

create or replace function public.release_order_allocation(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.orders
    where id = p_order_id
      and status in ('draft', 'pending_payment')
  ) then
    return;
  end if;

  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';

  update public.orders
     set checkout_reserved_until = null
   where id = p_order_id;
end;
$$;

revoke all on function public.release_order_allocation(uuid) from public, anon, authenticated;
grant execute on function public.release_order_allocation(uuid) to service_role;

create or replace function public.settle_order_payment(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select o.*
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'paid' then
    return 'paid';
  end if;

  if v_order.status <> 'pending_payment' then
    return 'not_payable';
  end if;

  if v_order.checkout_reserved_until is null or v_order.checkout_reserved_until <= now() then
    update public.inventory i
       set allocated = greatest(0, i.allocated - oi.quantity)
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.sku_id = i.sku_id
       and i.location = 'main';

    update public.orders
       set status = 'cancelled',
           checkout_reserved_until = null
     where id = p_order_id;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      'stripe:webhook',
      'orders',
      p_order_id::text,
      'LATE_PAYMENT_AFTER_RESERVATION',
      jsonb_build_object('provider_payment_id', trim(p_provider_payment_id))
    );

    return 'expired';
  end if;

  if p_amount_cents is null or p_amount_cents <> v_order.total_cents then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'payment currency mismatch' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'paid',
         checkout_reserved_until = null
   where id = p_order_id;

  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity),
         on_hand = greatest(0, i.on_hand - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';

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
        updated_at = now();

  return 'paid';
end;
$$;

revoke all on function public.settle_order_payment(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_order_payment(uuid, text, integer, text)
  to service_role;

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
  v_result text;
begin
  v_result := public.settle_order_payment(
    p_order_id,
    p_provider_payment_id,
    p_amount_cents,
    p_currency
  );

  if v_result <> 'paid' then
    raise exception 'order not payable: %', v_result using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, integer, text)
  to service_role;
