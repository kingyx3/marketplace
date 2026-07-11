\set ON_ERROR_STOP on

begin;

-- Seed a real orderable SKU for transactional checkout assertions.
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

update public.storefront_configurations
set active = true,
    value = '{"enabled":true,"reservationHours":24,"maxPaymentTermDays":30,"requirePurchaseOrderReference":true}'::jsonb
where "key" = 'b2b_invoice_policy';

do $$
declare
  v_auth_user_id uuid := '10000000-0000-4000-8000-000000000001';
  v_customer_id uuid;
  v_account_id uuid;
  v_sku_id uuid;
  v_order record;
  v_invoice record;
  v_count integer;
  v_allocated integer;
  v_status public.order_status;
  v_payment_status public.payment_status;
begin
  insert into auth.users (id, email)
  values (v_auth_user_id, 'checkout-contract@example.test');

  insert into public.customers (auth_user_id, email, name, segment, default_currency)
  values (v_auth_user_id, 'checkout-contract@example.test', 'Checkout Contract', 'reseller', 'SGD')
  returning id into v_customer_id;

  select id into v_sku_id
  from public.booster_box_skus
  where sku = 'MTG-SMP-PBB-EN';

  if v_sku_id is null then
    raise exception 'seed SKU not found';
  end if;

  -- The legacy no-address function must remain fail-closed during rolling deploys.
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

  if not exists (
    select 1
    from public.orders o
    where o.id = v_order.order_id
      and o.shipping_cents = 800
      and o.shipping_service = 'CI tracked delivery'
      and o.shipping_address->>'countryCode' = 'SG'
      and o.tax_cents = round(20700 * 9.0 / 109.0)::integer
  ) then
    raise exception 'order shipping snapshot was not persisted';
  end if;

  perform public.release_order_allocation(v_order.order_id);

  insert into public.b2b_accounts (
    customer_id,
    company_name,
    payment_terms,
    credit_limit_cents,
    approved,
    approved_at,
    review_status,
    reviewed_at
  )
  values (
    v_customer_id,
    'Checkout Contract Pte Ltd',
    'NET30',
    30000,
    true,
    now(),
    'approved',
    now()
  )
  returning id into v_account_id;

  select * into v_invoice
  from public.create_b2b_invoice_order_from_cart(
    v_auth_user_id,
    jsonb_build_array(jsonb_build_object('sku_id', v_sku_id, 'quantity', 1)),
    '{"recipientName":"Checkout Contract","line1":"1 Market Street","city":"Singapore","postalCode":"048940","countryCode":"SG"}'::jsonb,
    'PO-CI-001',
    19900,
    0,
    0,
    20700
  );

  if v_invoice.payment_due_at <= now()
     or v_invoice.allocation_expires_at <= now()
     or v_invoice.allocation_expires_at > v_invoice.payment_due_at then
    raise exception 'invoice deadlines are invalid';
  end if;

  begin
    perform * from public.create_b2b_invoice_order_from_cart(
      v_auth_user_id,
      jsonb_build_array(jsonb_build_object('sku_id', v_sku_id, 'quantity', 1)),
      '{"recipientName":"Checkout Contract","line1":"1 Market Street","city":"Singapore","postalCode":"048940","countryCode":"SG"}'::jsonb,
      'PO-CI-001',
      19900,
      0,
      0,
      20700
    );
    raise exception 'duplicate invoice reference unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  begin
    perform * from public.create_b2b_invoice_order_from_cart(
      v_auth_user_id,
      jsonb_build_array(jsonb_build_object('sku_id', v_sku_id, 'quantity', 1)),
      '{"recipientName":"Checkout Contract","line1":"1 Market Street","city":"Singapore","postalCode":"048940","countryCode":"SG"}'::jsonb,
      'PO-CI-002',
      19900,
      0,
      0,
      20700
    );
    raise exception 'over-credit invoice unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%credit limit%' then
        raise;
      end if;
  end;

  insert into public.payments (
    order_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status
  )
  values (
    v_invoice.order_id,
    'manual_invoice',
    'invoice:' || v_invoice.order_id::text,
    'invoice',
    20700,
    'SGD',
    'pending'
  );

  update public.orders
  set allocation_expires_at = now() - interval '1 minute'
  where id = v_invoice.order_id;

  select public.expire_stale_invoice_orders(10) into v_count;
  if v_count <> 1 then
    raise exception 'expected one expired invoice order, got %', v_count;
  end if;

  select status into v_status
  from public.orders
  where id = v_invoice.order_id;
  if v_status <> 'cancelled' then
    raise exception 'expired invoice order was not cancelled';
  end if;

  select status into v_payment_status
  from public.payments
  where order_id = v_invoice.order_id
    and provider = 'manual_invoice';
  if v_payment_status <> 'cancelled' then
    raise exception 'expired invoice payment was not cancelled';
  end if;

  select i.allocated into v_allocated
  from public.inventory i
  where i.sku_id = v_sku_id
    and i.location = 'main';
  if v_allocated <> 0 then
    raise exception 'expired invoice allocation was not released: %', v_allocated;
  end if;
end;
$$;

rollback;
