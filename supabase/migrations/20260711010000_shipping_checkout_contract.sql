-- Require an explicit delivery address and an operator-managed shipping policy
-- before any new order can reserve inventory or create payment state.

alter table public.orders
  add column if not exists shipping_address jsonb,
  add column if not exists shipping_service text,
  add column if not exists shipping_policy_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_shipping_address_object'
  ) then
    alter table public.orders
      add constraint orders_shipping_address_object
      check (shipping_address is null or jsonb_typeof(shipping_address) = 'object');
  end if;
end $$;

insert into public.storefront_configurations ("key", label, description, value, active)
values (
  'shipping_policy',
  'Checkout shipping policy',
  'Enable only after setting the supported ISO country codes, currency, flat rate, optional free-shipping threshold, and service name.',
  '{"enabled":false,"currency":"SGD","supportedCountryCodes":["SG"],"flatRateCents":0,"freeShippingThresholdCents":null,"serviceName":"Configure before launch"}'::jsonb,
  false
)
on conflict ("key") do nothing;

-- Fail closed for the old application contract during a migration/application
-- deployment gap. The replacement overload below is the only payable path.
create or replace function public.create_checkout_order_from_cart(
  p_auth_user_id uuid,
  p_items jsonb,
  p_channel public.sales_channel default 'b2c',
  p_expected_subtotal_cents integer default null,
  p_discount_cents integer default 0,
  p_discount_bps integer default 0,
  p_expected_total_cents integer default null
)
returns table (
  order_id uuid,
  customer_id uuid,
  subtotal_cents integer,
  discount_cents integer,
  discount_bps integer,
  total_cents integer,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'shipping address and active shipping policy required'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, integer, integer, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.create_checkout_order_from_cart(
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
  currency text
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
begin
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
       set allocated = allocated + v_item.quantity
     where i.sku_id = v_item.sku_id
       and i.location = 'main'
       and greatest(0, i.available - i.safety_stock) >= v_item.quantity;

    if not found then
      raise exception 'insufficient inventory' using errcode = 'P0001';
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
         v_currency;
end;
$$;

revoke all on function public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
) to service_role;
