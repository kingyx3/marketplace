-- Production app primitives layered on top of the initial marketplace schema.
-- This migration avoids editing the applied baseline and adds the pieces the
-- web app needs for customer provisioning, admin authorization, and guarded
-- commercial writes.

alter type public.payment_status add value if not exists 'pending';

alter table public.customers
  add column if not exists stripe_customer_id text unique,
  add column if not exists billing_state text not null default 'unpaid'
    check (billing_state in ('unpaid', 'payment_pending', 'active', 'past_due', 'cancelled')),
  add column if not exists provisioning_state text not null default 'active'
    check (provisioning_state in ('pending', 'active', 'error')),
  add column if not exists provisioning_error text;

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'admin', 'owner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;

drop trigger if exists set_updated_at on public.staff_users;
create trigger set_updated_at before update on public.staff_users
  for each row execute function public.set_updated_at();

drop trigger if exists audit_log on public.staff_users;
create trigger audit_log after insert or update or delete on public.staff_users
  for each row execute function public.write_audit_log();

create or replace function public.is_staff(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = check_user_id
      and staff.active
  );
$$;

revoke all on function public.is_staff(uuid) from public, anon, authenticated;
grant execute on function public.is_staff(uuid) to service_role;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (auth_user_id, email, name)
  values (
    new.id,
    coalesce(new.email, concat(new.id::text, '@unknown.local')),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists provision_customer_from_auth_user on auth.users;
create trigger provision_customer_from_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.create_checkout_order(
  p_auth_user_id uuid,
  p_sku_id uuid,
  p_quantity integer,
  p_channel public.sales_channel default 'b2c'
)
returns table (
  order_id uuid,
  customer_id uuid,
  sku_id uuid,
  quantity integer,
  unit_price_cents integer,
  total_cents integer,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_unit_price integer;
  v_currency text;
  v_order_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 24 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.auth_user_id = p_auth_user_id;

  if v_customer_id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  select s.price_cents, s.currency
    into v_unit_price, v_currency
  from public.booster_box_skus s
  join public.product_variants v on v.id = s.product_variant_id
  join public.products p on p.id = v.product_id
  where s.id = p_sku_id
    and p.active;

  if v_unit_price is null then
    raise exception 'sku not available' using errcode = 'P0002';
  end if;

  update public.inventory i
     set allocated = allocated + p_quantity
   where i.sku_id = p_sku_id
     and i.location = 'main'
     and i.available >= p_quantity;

  if not found then
    raise exception 'insufficient inventory' using errcode = 'P0001';
  end if;

  insert into public.orders (
    customer_id,
    channel,
    status,
    currency,
    subtotal_cents,
    shipping_cents,
    tax_cents,
    total_cents,
    placed_at
  )
  values (
    v_customer_id,
    p_channel,
    'pending_payment',
    v_currency,
    v_unit_price * p_quantity,
    0,
    round((v_unit_price * p_quantity) * 9.0 / 109.0)::integer,
    v_unit_price * p_quantity,
    now()
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, sku_id, quantity, unit_price_cents)
  values (v_order_id, p_sku_id, p_quantity, v_unit_price);

  return query
  select v_order_id, v_customer_id, p_sku_id, p_quantity, v_unit_price,
         v_unit_price * p_quantity, v_currency;
end;
$$;

revoke all on function public.create_checkout_order(uuid, uuid, integer, public.sales_channel)
  from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid, uuid, integer, public.sales_channel)
  to service_role;

create or replace function public.create_checkout_order_from_cart(
  p_auth_user_id uuid,
  p_items jsonb,
  p_channel public.sales_channel default 'b2c'
)
returns table (
  order_id uuid,
  customer_id uuid,
  subtotal_cents integer,
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 10 then
    raise exception 'too many cart lines' using errcode = '22023';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.auth_user_id = p_auth_user_id;

  if v_customer_id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  insert into public.orders (customer_id, channel, status, subtotal_cents, total_cents, placed_at)
  values (v_customer_id, p_channel, 'pending_payment', 0, 0, now())
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

    select s.price_cents, s.currency
      into v_unit_price, v_line_currency
    from public.booster_box_skus s
    join public.product_variants v on v.id = s.product_variant_id
    join public.products p on p.id = v.product_id
    where s.id = v_item.sku_id
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
       and i.available >= v_item.quantity;

    if not found then
      raise exception 'insufficient inventory' using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, sku_id, quantity, unit_price_cents)
    values (v_order_id, v_item.sku_id, v_item.quantity, v_unit_price);

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
  end loop;

  update public.orders
     set currency = v_currency,
         subtotal_cents = v_subtotal,
         shipping_cents = 0,
         tax_cents = round(v_subtotal * 9.0 / 109.0)::integer,
         total_cents = v_subtotal
   where id = v_order_id;

  return query
  select v_order_id, v_customer_id, v_subtotal, v_subtotal, v_currency;
end;
$$;

revoke all on function public.create_checkout_order_from_cart(uuid, jsonb, public.sales_channel)
  from public, anon, authenticated;
grant execute on function public.create_checkout_order_from_cart(uuid, jsonb, public.sales_channel)
  to service_role;

create or replace function public.release_order_allocation(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';
end;
$$;

revoke all on function public.release_order_allocation(uuid) from public, anon, authenticated;
grant execute on function public.release_order_allocation(uuid) to service_role;

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
begin
  select customer_id into v_customer_id
  from public.orders
  where id = p_order_id
    and status in ('pending_payment', 'paid');

  if v_customer_id is null then
    raise exception 'order not found' using errcode = 'P0002';
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
  on conflict (provider, provider_payment_id) do nothing;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, integer, text)
  to service_role;

create or replace function public.ship_order(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set status = 'shipped'
   where id = p_order_id
     and status in ('paid', 'packing', 'shipped');

  if not found then
    raise exception 'order not shippable' using errcode = 'P0001';
  end if;

  insert into public.shipments (
    order_id,
    carrier,
    tracking_number,
    status,
    shipped_at
  )
  values (
    p_order_id,
    nullif(trim(p_carrier), ''),
    nullif(trim(p_tracking_number), ''),
    'in_transit',
    now()
  );
end;
$$;

revoke all on function public.ship_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ship_order(uuid, text, text) to service_role;
