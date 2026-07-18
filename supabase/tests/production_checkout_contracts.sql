\set ON_ERROR_STOP on

begin;

update public.inventory i
set on_hand = 20,
    incoming = 0,
    allocated = 0,
    safety_stock = 0
from public.booster_box_skus s
where i.sku_id = s.id
  and s.sku = 'MTG-SMP-PBB-EN'
  and i.location = 'main';

update public.storefront_configurations
set active = true,
    value = '{"enabled":true,"currency":"SGD","supportedCountryCodes":["SG"],"flatRateCents":800,"freeShippingThresholdCents":null,"serviceName":"CI tracked delivery"}'::jsonb
where "key" = 'shipping_policy';

do $$
declare
  v_auth_user_id uuid := '10000000-0000-4000-8000-000000000001';
  v_customer_id uuid;
  v_sku_id uuid;
  v_order record;
  v_allocated integer;
  v_reserved_until timestamptz;
  v_order_status public.order_status;
begin
  insert into auth.users (id, email)
  values (v_auth_user_id, 'checkout-contract@example.test');

  update public.customers
  set name = 'Checkout Contract',
      segment = 'collector',
      default_currency = 'SGD'
  where auth_user_id = v_auth_user_id
  returning id into v_customer_id;

  if v_customer_id is null then
    raise exception 'auth user did not provision a customer';
  end if;

  select id into v_sku_id
  from public.booster_box_skus
  where sku = 'MTG-SMP-PBB-EN';

  if v_sku_id is null then
    raise exception 'seed SKU not found';
  end if;

  begin
    perform * from public.create_checkout_order_from_cart(
      v_auth_user_id,
      jsonb_build_array(jsonb_build_object('sku_id', v_sku_id, 'quantity', 1)),
      'b2c'::public.sales_channel,
      19900,
      0,
      0,
      19900
    );
    raise exception 'legacy checkout unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%shipping address%' then
        raise;
      end if;
  end;

  select * into v_order
  from public.create_checkout_order_from_cart(
    v_auth_user_id,
    jsonb_build_array(jsonb_build_object('sku_id', v_sku_id, 'quantity', 1)),
    'b2c'::public.sales_channel,
    '{"recipientName":"Checkout Contract","line1":"1 Market Street","city":"Singapore","postalCode":"048940","countryCode":"SG"}'::jsonb,
    19900,
    0,
    0,
    20700
  );

  if v_order.total_cents <> 20700 then
    raise exception 'shipping-aware total mismatch: %', v_order.total_cents;
  end if;

  select o.checkout_reserved_until
    into v_reserved_until
  from public.orders o
  where o.id = v_order.order_id;

  if v_reserved_until is null
     or v_reserved_until < now() + interval '14 minutes'
     or v_reserved_until > now() + interval '16 minutes' then
    raise exception 'checkout reservation is not approximately 15 minutes: %', v_reserved_until;
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = v_order.order_id
      and o.channel::text = 'b2c'
      and o.status = 'pending_payment'
      and o.shipping_cents = 800
      and o.shipping_service = 'CI tracked delivery'
      and o.shipping_address->>'countryCode' = 'SG'
      and o.tax_cents = round(20700 * 9.0 / 109.0)::integer
  ) then
    raise exception 'retail order snapshot was not persisted';
  end if;

  update public.orders
     set checkout_reserved_until = now() - interval '1 second'
   where id = v_order.order_id;

  perform * from public.expire_checkout_reservations(10);

  select o.status into v_order_status
  from public.orders o
  where o.id = v_order.order_id;
  if v_order_status <> 'cancelled' then
    raise exception 'expired checkout was not cancelled: %', v_order_status;
  end if;

  select i.allocated into v_allocated
  from public.inventory i
  where i.sku_id = v_sku_id
    and i.location = 'main';
  if v_allocated <> 0 then
    raise exception 'expired retail allocation was not released: %', v_allocated;
  end if;

  if to_regclass('public.b2b_accounts') is not null
     or to_regclass('public.pricing_tiers') is not null
     or to_regclass('public.customer_pricing_tiers') is not null then
    raise exception 'wholesale tables still exist';
  end if;

  if to_regprocedure('public.create_b2b_invoice_order_from_cart(uuid,jsonb,jsonb,text,integer,integer,integer,integer)') is not null
     or to_regprocedure('public.admin_set_b2b_credit_terms(uuid,text,integer,text)') is not null
     or to_regprocedure('public.expire_stale_invoice_orders(integer)') is not null then
    raise exception 'wholesale invoice functions still exist';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name in ('payment_method', 'invoice_reference', 'payment_due_at', 'allocation_expires_at')
  ) then
    raise exception 'invoice-only order columns still exist';
  end if;

  if exists (
    select 1
    from public.listing_items
    where channels is distinct from array['b2c']::text[]
  ) then
    raise exception 'non-retail listing channels remain';
  end if;
end;
$$;

rollback;
