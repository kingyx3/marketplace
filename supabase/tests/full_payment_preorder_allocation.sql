\set ON_ERROR_STOP on

begin;

do $$
declare
  v_auth_user_1 uuid := '10000000-0000-4000-8000-000000000011';
  v_auth_user_2 uuid := '10000000-0000-4000-8000-000000000012';
  v_customer_1 uuid;
  v_customer_2 uuid;
  v_sku_id uuid;
  v_preorder_1 uuid := '20000000-0000-4000-8000-000000000011';
  v_preorder_2 uuid := '20000000-0000-4000-8000-000000000012';
  v_order_id uuid;
  v_stage_count integer;
  v_inventory_allocated integer;
  v_refund_cents integer;
  v_settlement text;
begin
  insert into auth.users (id, email)
  values
    (v_auth_user_1, 'allocation-one@example.test'),
    (v_auth_user_2, 'allocation-two@example.test');

  select id into v_customer_1
  from public.customers
  where auth_user_id = v_auth_user_1;

  select id into v_customer_2
  from public.customers
  where auth_user_id = v_auth_user_2;

  if v_customer_1 is null or v_customer_2 is null then
    raise exception 'allocation customers were not provisioned';
  end if;

  select id into v_sku_id
  from public.booster_box_skus
  where sku = 'MTG-SMP-PBB-EN';

  if v_sku_id is null then
    raise exception 'seed SKU not found';
  end if;

  update public.inventory
     set on_hand = 1,
         incoming = 0,
         allocated = 0,
         safety_stock = 0
   where sku_id = v_sku_id
     and location = 'main';

  insert into public.preorders (
    id,
    customer_id,
    sku_id,
    channel,
    quantity,
    unit_price_cents,
    deposit_cents,
    balance_cents,
    currency,
    status
  )
  values
    (
      v_preorder_1,
      v_customer_1,
      v_sku_id,
      'b2c',
      1,
      19900,
      19900,
      0,
      'SGD',
      'paid'
    ),
    (
      v_preorder_2,
      v_customer_2,
      v_sku_id,
      'b2c',
      1,
      19900,
      19900,
      0,
      'SGD',
      'paid'
    );

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
    (v_preorder_1, 'hitpay', 'hitpay_allocation_one', 'full', 19900, 'SGD', 'captured', now()),
    (v_preorder_2, 'hitpay', 'hitpay_allocation_two', 'full', 19900, 'SGD', 'captured', now());

  select count(*)::integer into v_stage_count
  from public.stage_preorder_allocations(
    v_sku_id,
    jsonb_build_array(
      jsonb_build_object('preorder_id', v_preorder_1, 'allocated', 1),
      jsonb_build_object('preorder_id', v_preorder_2, 'allocated', 0)
    ),
    repeat('a', 64),
    'staff:allocation-contract'
  );

  if v_stage_count <> 2 then
    raise exception 'expected two staged preorder rows, got %', v_stage_count;
  end if;

  if not exists (
    select 1
    from public.preorders
    where id = v_preorder_1
      and status = 'allocated'
      and allocated_qty = 1
      and allocation_refund_cents = 0
  ) then
    raise exception 'fully allocated preorder was not staged correctly';
  end if;

  if not exists (
    select 1
    from public.preorders
    where id = v_preorder_2
      and status = 'refund_pending'
      and allocated_qty = 0
      and allocation_refund_cents = 19900
  ) then
    raise exception 'shortfall preorder was not staged correctly';
  end if;

  select allocated into v_inventory_allocated
  from public.inventory
  where sku_id = v_sku_id
    and location = 'main';

  if v_inventory_allocated <> 1 then
    raise exception 'allocated inventory mismatch: %', v_inventory_allocated;
  end if;

  v_order_id := public.finalize_preorder_allocation(
    v_preorder_1,
    null,
    null,
    'staff:allocation-contract'
  );

  if v_order_id is null or not exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = v_order_id
      and o.status = 'paid'
      and oi.preorder_id = v_preorder_1
      and oi.quantity = 1
  ) then
    raise exception 'allocated preorder did not create the expected paid order';
  end if;

  begin
    perform public.finalize_preorder_allocation(
      v_preorder_2,
      null,
      null,
      'staff:allocation-contract'
    );
    raise exception 'shortfall finalized without HitPay refund confirmation';
  exception
    when sqlstate '22023' then
      if sqlerrm not like '%HitPay refund confirmation required%' then
        raise;
      end if;
  end;

  perform public.finalize_preorder_allocation(
    v_preorder_2,
    're_allocation_shortfall',
    'succeeded',
    'staff:allocation-contract'
  );

  if not exists (
    select 1
    from public.preorders
    where id = v_preorder_2
      and status = 'refunded'
      and order_id is null
  ) then
    raise exception 'zero-allocation preorder was not finalized as refunded';
  end if;

  select amount_cents into v_refund_cents
  from public.refunds
  where provider_refund_id = 're_allocation_shortfall'
    and status = 'succeeded';

  if v_refund_cents <> 19900 then
    raise exception 'allocation refund amount mismatch: %', v_refund_cents;
  end if;

  v_settlement := public.settle_preorder_payment(
    v_preorder_2,
    'hitpay_allocation_two',
    19900,
    'SGD'
  );

  if v_settlement <> 'not_payable' then
    raise exception 'refunded preorder accepted a late payment: %', v_settlement;
  end if;
end;
$$;

rollback;
