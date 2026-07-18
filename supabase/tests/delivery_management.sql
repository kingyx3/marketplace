begin;

do $$
declare
  v_category_id uuid := gen_random_uuid();
  v_set_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_variant_id uuid := gen_random_uuid();
  v_sku_id uuid := gen_random_uuid();
  v_customer_id uuid := gen_random_uuid();
  v_paid_order_id uuid := gen_random_uuid();
  v_underpaid_order_id uuid := gen_random_uuid();
  v_preorder_order_id uuid := gen_random_uuid();
  v_preorder_id uuid := gen_random_uuid();
  v_shipment_id uuid;
  v_address jsonb := '{"recipientName":"Delivery Test","line1":"1 Test Street","postalCode":"018989","countryCode":"SG"}'::jsonb;
begin
  insert into public.tcg_categories (id, slug, name)
  values (v_category_id, 'delivery-test', 'Delivery Test');

  insert into public.sets_releases (id, category_id, name, code, status)
  values (v_set_id, v_category_id, 'Delivery Test Set', 'DELIVERY', 'released');

  insert into public.products (id, category_id, set_id, product_type, language)
  values (v_product_id, v_category_id, v_set_id, 'booster_box', 'EN');

  insert into public.product_variants (id, product_id, name)
  values (v_variant_id, v_product_id, 'default');

  insert into public.booster_box_skus (id, product_variant_id, sku, price_cents, currency)
  values (v_sku_id, v_variant_id, 'DELIVERY-TEST-SKU', 10000, 'SGD');

  insert into public.customers (id, email, name)
  values (v_customer_id, 'delivery-contract@example.test', 'Delivery Contract');

  insert into public.orders (
    id,
    customer_id,
    status,
    currency,
    subtotal_cents,
    total_cents,
    shipping_address,
    placed_at
  )
  values (
    v_paid_order_id,
    v_customer_id,
    'paid',
    'SGD',
    10000,
    10000,
    v_address,
    now()
  );

  insert into public.order_items (order_id, sku_id, quantity, unit_price_cents)
  values (v_paid_order_id, v_sku_id, 1, 10000);

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
    v_paid_order_id,
    'contract',
    'delivery-paid',
    'full',
    10000,
    'SGD',
    'captured',
    now()
  );

  perform public.admin_mark_order_packing(v_paid_order_id, 'contract:test');
  v_shipment_id := public.admin_arrange_delivery(
    v_paid_order_id,
    'Contract Courier',
    'TRACK-PAID',
    null,
    'contract:test'
  );
  perform public.admin_update_delivery_status(
    v_paid_order_id,
    v_shipment_id,
    'delivered',
    'contract:test'
  );

  if not exists (
    select 1
    from public.orders order_row
    join public.shipments shipment on shipment.order_id = order_row.id
    where order_row.id = v_paid_order_id
      and order_row.status = 'delivered'
      and shipment.id = v_shipment_id
      and shipment.status = 'delivered'
      and shipment.shipped_at is not null
      and shipment.delivered_at is not null
  ) then
    raise exception 'fully paid order did not complete the delivery lifecycle';
  end if;

  insert into public.orders (
    id,
    customer_id,
    status,
    currency,
    subtotal_cents,
    total_cents,
    shipping_address,
    placed_at
  )
  values (
    v_underpaid_order_id,
    v_customer_id,
    'paid',
    'SGD',
    10000,
    10000,
    v_address,
    now()
  );

  insert into public.order_items (order_id, sku_id, quantity, unit_price_cents)
  values (v_underpaid_order_id, v_sku_id, 1, 10000);

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
    v_underpaid_order_id,
    'contract',
    'delivery-underpaid',
    'full',
    5000,
    'SGD',
    'captured',
    now()
  );

  begin
    perform public.admin_arrange_delivery(
      v_underpaid_order_id,
      'Contract Courier',
      'TRACK-UNDERPAID',
      null,
      'contract:test'
    );
    raise exception 'underpaid order was incorrectly accepted for delivery';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'order payment incomplete' then
        raise;
      end if;
  end;

  insert into public.orders (
    id,
    customer_id,
    status,
    currency,
    subtotal_cents,
    total_cents,
    placed_at
  )
  values (
    v_preorder_order_id,
    v_customer_id,
    'paid',
    'SGD',
    12000,
    12000,
    now()
  );

  insert into public.preorders (
    id,
    customer_id,
    sku_id,
    quantity,
    unit_price_cents,
    deposit_cents,
    balance_cents,
    currency,
    status,
    allocated_qty,
    order_id
  )
  values (
    v_preorder_id,
    v_customer_id,
    v_sku_id,
    1,
    12000,
    2000,
    0,
    'SGD',
    'converted',
    1,
    v_preorder_order_id
  );

  insert into public.order_items (order_id, sku_id, preorder_id, quantity, unit_price_cents)
  values (v_preorder_order_id, v_sku_id, v_preorder_id, 1, 12000);

  insert into public.payments (
    preorder_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status,
    captured_at
  )
  values
    (v_preorder_id, 'contract', 'delivery-preorder-deposit', 'deposit', 2000, 'SGD', 'captured', now()),
    (v_preorder_id, 'contract', 'delivery-preorder-balance', 'balance', 10000, 'SGD', 'captured', now());

  v_shipment_id := public.admin_arrange_delivery(
    v_preorder_order_id,
    'Contract Courier',
    null,
    v_address,
    'contract:test'
  );

  if public.order_captured_payment_total(v_preorder_order_id) <> 12000 then
    raise exception 'preorder-linked payments were not included in the order total';
  end if;

  if not exists (
    select 1
    from public.shipments
    where id = v_shipment_id
      and order_id = v_preorder_order_id
      and status = 'label_created'
  ) then
    raise exception 'converted preorder order was not accepted for delivery';
  end if;
end;
$$;

rollback;
