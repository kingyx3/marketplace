-- Enforce 15-minute checkout reservations and full-upfront preorder allocation.

create or replace function public.expire_checkout_reservations()
returns table (order_id uuid, provider_payment_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  for v_order in
    select o.id
    from public.orders o
    where o.status = 'pending_payment'
      and o.checkout_reserved_until is not null
      and o.checkout_reserved_until <= now()
    order by o.checkout_reserved_until, o.id
    for update skip locked
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
       and p.status in ('requires_capture', 'authorized');

    update public.orders o
       set status = 'cancelled',
           checkout_reserved_until = null
     where o.id = v_order.id
       and o.status = 'pending_payment';

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

revoke all on function public.expire_checkout_reservations() from public, anon, authenticated;
grant execute on function public.expire_checkout_reservations() to service_role;

-- Supabase Cron executes the release function every minute. The application also
-- calls the function opportunistically before checkout so expired stock is freed
-- even if Cron is temporarily unavailable.
create extension if not exists pg_cron;
select cron.schedule(
  'expire-checkout-reservations',
  '* * * * *',
  'select public.expire_checkout_reservations();'
);

drop function if exists public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
);

create function public.create_checkout_order_from_cart(
  p_auth_user_id uuid,
  p_items jsonb,
  p_channel public.sales_channel,
  p_shipping_address jsonb,
  p_expected_subtotal_cents integer,
  p_discount_cents integer,
  p_discount_bps integer,
  p_expected_total_cents integer
)
returns table (
  order_id uuid,
  customer_id uuid,
  subtotal_cents integer,
  discount_cents integer,
  discount_bps integer,
  total_cents integer,
  currency text,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item record;
  v_unit_price integer;
  v_currency text;
  v_line_currency text;
  v_subtotal integer := 0;
  v_total_quantity integer := 0;
  v_merchandise_total integer;
  v_shipping_cents integer;
  v_total integer;
  v_policy jsonb;
  v_policy_active boolean;
  v_policy_currency text;
  v_country_code text;
  v_service_name text;
  v_flat_rate_cents integer;
  v_free_shipping_threshold_cents integer;
  v_reservation_expires_at timestamptz := now() + interval '15 minutes';
begin
  perform public.expire_checkout_reservations();

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 10 then
    raise exception 'too many cart lines' using errcode = '22023';
  end if;

  if p_discount_cents is null or p_discount_cents < 0 then
    raise exception 'invalid discount' using errcode = '22023';
  end if;

  if p_discount_bps is null or p_discount_bps < 0 or p_discount_bps > 10000 then
    raise exception 'invalid discount rate' using errcode = '22023';
  end if;

  if p_expected_total_cents is null then
    raise exception 'expected total required' using errcode = '22023';
  end if;

  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'shipping address required' using errcode = '22023';
  end if;

  if trim(coalesce(p_shipping_address->>'recipientName', '')) = ''
     or trim(coalesce(p_shipping_address->>'line1', '')) = ''
     or trim(coalesce(p_shipping_address->>'postalCode', '')) = '' then
    raise exception 'shipping address is incomplete' using errcode = '22023';
  end if;

  v_country_code := upper(trim(coalesce(p_shipping_address->>'countryCode', '')));
  if v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'shipping country code is invalid' using errcode = '22023';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.auth_user_id = p_auth_user_id;

  if v_customer_id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  select value, active
    into v_policy, v_policy_active
  from public.storefront_configurations
  where "key" = 'shipping_policy';

  if not coalesce(v_policy_active, false)
     or v_policy is null
     or jsonb_typeof(v_policy) <> 'object'
     or lower(coalesce(v_policy->>'enabled', 'false')) <> 'true' then
    raise exception 'shipping checkout is not configured' using errcode = 'P0001';
  end if;

  v_policy_currency := upper(trim(coalesce(v_policy->>'currency', '')));
  v_service_name := trim(coalesce(v_policy->>'serviceName', ''));

  begin
    v_flat_rate_cents := (v_policy->>'flatRateCents')::integer;
    v_free_shipping_threshold_cents := nullif(v_policy->>'freeShippingThresholdCents', '')::integer;
  exception when others then
    raise exception 'shipping policy amounts are invalid' using errcode = '22023';
  end;

  if v_flat_rate_cents is null or v_flat_rate_cents < 0
     or (v_free_shipping_threshold_cents is not null and v_free_shipping_threshold_cents < 0)
     or v_service_name = '' then
    raise exception 'shipping policy is invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(v_policy->'supportedCountryCodes') <> 'array'
     or not exists (
       select 1
       from jsonb_array_elements_text(v_policy->'supportedCountryCodes') as supported(country_code)
       where upper(trim(supported.country_code)) = v_country_code
     ) then
    raise exception 'shipping is not available for this destination' using errcode = 'P0001';
  end if;

  insert into public.orders (
    customer_id,
    channel,
    status,
    subtotal_cents,
    discount_cents,
    discount_bps,
    shipping_cents,
    total_cents,
    shipping_address,
    shipping_service,
    shipping_policy_key,
    checkout_reserved_until,
    placed_at
  )
  values (
    v_customer_id,
    p_channel,
    'pending_payment',
    0,
    0,
    0,
    0,
    0,
    jsonb_set(p_shipping_address, '{countryCode}', to_jsonb(v_country_code), true),
    v_service_name,
    'shipping_policy',
    v_reservation_expires_at,
    now()
  )
  returning id into v_order_id;

  for v_item in
    select sku_id, quantity
    from jsonb_to_recordset(p_items) as item(sku_id uuid, quantity integer)
  loop
    if v_item.quantity is null or v_item.quantity <= 0 or v_item.quantity > 24 then
      raise exception 'invalid quantity' using errcode = '22023';
    end if;

    v_total_quantity := v_total_quantity + v_item.quantity;
    if v_total_quantity > 24 then
      raise exception 'cart quantity limit exceeded' using errcode = '22023';
    end if;

    select s.price_cents, upper(s.currency)
      into v_unit_price, v_line_currency
    from public.booster_box_skus s
    join public.product_variants v on v.id = s.product_variant_id
    join public.products p on p.id = v.product_id
    where s.id = v_item.sku_id
      and s.active
      and p.active;

    if v_unit_price is null then
      raise exception 'sku not available' using errcode = 'P0002';
    end if;

    if v_currency is null then
      v_currency := v_line_currency;
    elsif v_currency <> v_line_currency then
      raise exception 'mixed-currency carts are not supported' using errcode = '22023';
    end if;

    update public.inventory i
       set allocated = i.allocated + v_item.quantity
     where i.sku_id = v_item.sku_id
       and i.location = 'main'
       and greatest(0, i.available - i.safety_stock) >= v_item.quantity;

    if not found then
      raise exception 'stock is reserved by another checkout or no longer available; refresh your cart and try again'
        using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, sku_id, quantity, unit_price_cents)
    values (v_order_id, v_item.sku_id, v_item.quantity, v_unit_price);

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
  end loop;

  if p_expected_subtotal_cents is not null and p_expected_subtotal_cents <> v_subtotal then
    raise exception 'checkout subtotal changed' using errcode = 'P0001';
  end if;

  if p_discount_cents > v_subtotal then
    raise exception 'discount exceeds subtotal' using errcode = '22023';
  end if;

  if v_policy_currency <> v_currency then
    raise exception 'shipping is not configured for this currency' using errcode = 'P0001';
  end if;

  v_merchandise_total := v_subtotal - p_discount_cents;
  v_shipping_cents := case
    when v_free_shipping_threshold_cents is not null
     and v_merchandise_total >= v_free_shipping_threshold_cents then 0
    else v_flat_rate_cents
  end;
  v_total := v_merchandise_total + v_shipping_cents;

  if p_expected_total_cents <> v_total then
    raise exception 'checkout total changed' using errcode = 'P0001';
  end if;

  update public.orders
     set currency = v_currency,
         subtotal_cents = v_subtotal,
         discount_cents = p_discount_cents,
         discount_bps = p_discount_bps,
         shipping_cents = v_shipping_cents,
         tax_cents = round(v_total * 9.0 / 109.0)::integer,
         total_cents = v_total
   where id = v_order_id;

  return query
  select v_order_id,
         v_customer_id,
         v_subtotal,
         p_discount_cents,
         p_discount_bps,
         v_total,
         v_currency,
         v_reservation_expires_at;
end;
$$;

revoke all on function public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
) to service_role;

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

    update public.payments
       set status = 'cancelled'
     where order_id = p_order_id
       and status in ('requires_capture', 'authorized');

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

drop function if exists public.apply_preorder_allocations(uuid, jsonb, text);
drop function if exists public.mark_preorder_balance_paid(uuid, text, integer, text);

create function public.stage_preorder_allocations(
  p_sku_id uuid,
  p_allocations jsonb,
  p_fingerprint text,
  p_actor text
)
returns table (
  preorder_id uuid,
  allocated_qty integer,
  refund_cents integer,
  payment_id uuid,
  provider_payment_id text,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory record;
  v_item record;
  v_preorder record;
  v_payment record;
  v_available integer;
  v_total_allocated integer := 0;
  v_expected_count integer;
  v_candidate_count integer;
  v_distinct_count integer;
begin
  if p_sku_id is null then
    raise exception 'sku required' using errcode = '22023';
  end if;

  if nullif(trim(p_actor), '') is null then
    raise exception 'allocation actor required' using errcode = '22023';
  end if;

  if nullif(trim(p_fingerprint), '') is null then
    raise exception 'allocation fingerprint required' using errcode = '22023';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be an array' using errcode = '22023';
  end if;

  select i.*
    into v_inventory
  from public.inventory i
  where i.sku_id = p_sku_id
    and i.location = 'main'
  for update;

  if v_inventory.id is null then
    raise exception 'inventory not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.preorders p
  where p.sku_id = p_sku_id
    and p.channel = 'b2c'
    and p.status = 'paid'
  order by p.created_at, p.id
  for update;

  select count(*)::integer
    into v_expected_count
  from public.preorders p
  where p.sku_id = p_sku_id
    and p.channel = 'b2c'
    and p.status = 'paid';

  select count(*)::integer, count(distinct candidate.preorder_id)::integer
    into v_candidate_count, v_distinct_count
  from jsonb_to_recordset(p_allocations) as candidate(preorder_id uuid, allocated integer);

  if v_expected_count = 0 then
    return;
  end if;

  if v_candidate_count <> v_expected_count or v_distinct_count <> v_expected_count then
    raise exception 'allocation preview is stale; refresh and confirm again' using errcode = 'P0001';
  end if;

  v_available := greatest(
    0,
    v_inventory.on_hand + v_inventory.incoming - v_inventory.allocated - v_inventory.safety_stock
  );

  for v_item in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations) as candidate(preorder_id uuid, allocated integer)
  loop
    select p.*
      into v_preorder
    from public.preorders p
    where p.id = v_item.preorder_id
      and p.sku_id = p_sku_id
      and p.channel = 'b2c'
      and p.status = 'paid'
    for update;

    if v_preorder.id is null then
      raise exception 'allocation preview is stale; refresh and confirm again' using errcode = 'P0001';
    end if;

    if v_item.allocated is null or v_item.allocated < 0 or v_item.allocated > v_preorder.quantity then
      raise exception 'invalid preorder allocation' using errcode = '22023';
    end if;

    select pay.id, pay.provider_payment_id, pay.amount_cents, pay.currency
      into v_payment
    from public.payments pay
    where pay.preorder_id = v_preorder.id
      and pay.kind = 'full'
      and pay.status = 'captured'
    order by pay.captured_at desc nulls last, pay.created_at desc
    limit 1
    for update;

    if v_payment.id is null
       or v_payment.amount_cents <> v_preorder.quantity * v_preorder.unit_price_cents
       or upper(v_payment.currency) <> upper(v_preorder.currency) then
      raise exception 'preorder does not have a matching full payment' using errcode = 'P0001';
    end if;

    v_total_allocated := v_total_allocated + v_item.allocated;
  end loop;

  if v_total_allocated > v_available then
    raise exception 'allocation stock changed; refresh and confirm again' using errcode = 'P0001';
  end if;

  update public.inventory
     set allocated = allocated + v_total_allocated
   where id = v_inventory.id;

  for v_item in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations) as candidate(preorder_id uuid, allocated integer)
  loop
    select p.*
      into v_preorder
    from public.preorders p
    where p.id = v_item.preorder_id
    for update;

    select pay.id, pay.provider_payment_id, pay.currency
      into v_payment
    from public.payments pay
    where pay.preorder_id = v_preorder.id
      and pay.kind = 'full'
      and pay.status = 'captured'
    order by pay.captured_at desc nulls last, pay.created_at desc
    limit 1;

    update public.preorders p
       set allocated_qty = v_item.allocated,
           allocation_refund_cents = (p.quantity - v_item.allocated) * p.unit_price_cents,
           allocation_confirmed_at = now(),
           allocation_actor = trim(p_actor),
           allocation_fingerprint = trim(p_fingerprint),
           status = case
             when v_item.allocated < p.quantity then 'refund_pending'::public.preorder_status
             else 'allocated'::public.preorder_status
           end
     where p.id = v_item.preorder_id
     returning p.id,
               p.allocated_qty,
               p.allocation_refund_cents,
               v_payment.id,
               v_payment.provider_payment_id,
               p.currency
      into preorder_id,
           allocated_qty,
           refund_cents,
           payment_id,
           provider_payment_id,
           currency;

    insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
    values (
      trim(p_actor),
      'preorders',
      v_item.preorder_id::text,
      'ADMIN_STAGE_PREORDER_ALLOCATION',
      jsonb_build_object('status', v_preorder.status, 'allocated_qty', v_preorder.allocated_qty),
      jsonb_build_object(
        'allocated_qty', allocated_qty,
        'refund_cents', refund_cents,
        'fingerprint', trim(p_fingerprint)
      )
    );

    return next;
  end loop;
end;
$$;

revoke all on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  to service_role;

create or replace function public.finalize_preorder_allocation(
  p_preorder_id uuid,
  p_provider_refund_id text,
  p_refund_status text,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preorder record;
  v_payment record;
  v_order_id uuid;
  v_order_total integer;
  v_refund_status public.refund_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'allocation actor required' using errcode = '22023';
  end if;

  select p.*
    into v_preorder
  from public.preorders p
  where p.id = p_preorder_id
  for update;

  if v_preorder.id is null then
    raise exception 'preorder not found' using errcode = 'P0002';
  end if;

  if v_preorder.order_id is not null and v_preorder.status = 'converted' then
    return v_preorder.order_id;
  end if;

  if v_preorder.status = 'refunded' and v_preorder.allocated_qty = 0 then
    return null;
  end if;

  if v_preorder.status not in ('allocated', 'refund_pending') then
    raise exception 'preorder allocation is not staged' using errcode = 'P0001';
  end if;

  select pay.*
    into v_payment
  from public.payments pay
  where pay.preorder_id = p_preorder_id
    and pay.kind = 'full'
    and pay.status = 'captured'
  order by pay.captured_at desc nulls last, pay.created_at desc
  limit 1
  for update;

  if v_payment.id is null then
    raise exception 'captured preorder payment not found' using errcode = 'P0002';
  end if;

  if v_preorder.allocation_refund_cents > 0 then
    if nullif(trim(p_provider_refund_id), '') is null then
      raise exception 'Stripe refund confirmation required' using errcode = '22023';
    end if;

    v_refund_status := case lower(trim(coalesce(p_refund_status, 'pending')))
      when 'succeeded' then 'succeeded'::public.refund_status
      when 'failed' then 'failed'::public.refund_status
      else 'pending'::public.refund_status
    end;

    insert into public.refunds (
      payment_id,
      provider_refund_id,
      amount_cents,
      currency,
      reason,
      status
    )
    values (
      v_payment.id,
      trim(p_provider_refund_id),
      v_preorder.allocation_refund_cents,
      upper(v_preorder.currency),
      'preorder_allocation_shortfall',
      v_refund_status
    )
    on conflict (provider_refund_id) do update
      set amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          reason = excluded.reason,
          status = excluded.status,
          updated_at = now();
  elsif nullif(trim(coalesce(p_provider_refund_id, '')), '') is not null then
    raise exception 'refund is not required for a full allocation' using errcode = '22023';
  end if;

  if v_preorder.allocated_qty > 0 then
    v_order_total := v_preorder.allocated_qty * v_preorder.unit_price_cents;

    insert into public.orders (
      customer_id,
      channel,
      status,
      currency,
      subtotal_cents,
      discount_cents,
      discount_bps,
      shipping_cents,
      tax_cents,
      total_cents,
      placed_at
    )
    values (
      v_preorder.customer_id,
      v_preorder.channel,
      'paid',
      upper(v_preorder.currency),
      v_order_total,
      0,
      0,
      0,
      round(v_order_total * 9.0 / 109.0)::integer,
      v_order_total,
      now()
    )
    returning id into v_order_id;

    insert into public.order_items (
      order_id,
      sku_id,
      preorder_id,
      quantity,
      unit_price_cents
    )
    values (
      v_order_id,
      v_preorder.sku_id,
      p_preorder_id,
      v_preorder.allocated_qty,
      v_preorder.unit_price_cents
    );

    update public.preorders
       set status = 'converted',
           order_id = v_order_id,
           balance_cents = 0
     where id = p_preorder_id;
  else
    update public.preorders
       set status = 'refunded',
           balance_cents = 0
     where id = p_preorder_id;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'preorders',
    p_preorder_id::text,
    'ADMIN_FINALIZE_PREORDER_ALLOCATION',
    jsonb_build_object(
      'allocated_qty', v_preorder.allocated_qty,
      'refund_cents', v_preorder.allocation_refund_cents,
      'provider_refund_id', nullif(trim(coalesce(p_provider_refund_id, '')), ''),
      'order_id', v_order_id
    )
  );

  return v_order_id;
end;
$$;

revoke all on function public.finalize_preorder_allocation(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_preorder_allocation(uuid, text, text, text)
  to service_role;
