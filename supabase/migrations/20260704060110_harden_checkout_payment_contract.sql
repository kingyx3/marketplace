-- Harden checkout, payment, and Data API contracts without editing applied migrations.

alter table public.orders
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0),
  add column if not exists discount_bps integer not null default 0 check (discount_bps between 0 and 10000);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_discount_not_over_subtotal'
  ) then
    alter table public.orders
      add constraint orders_discount_not_over_subtotal
      check (discount_cents <= subtotal_cents);
  end if;
end $$;

alter table public.refunds
  add column if not exists currency text not null default 'SGD';

alter table public.payments drop constraint if exists payments_target;
alter table public.payments
  add constraint payments_target check (num_nonnulls(order_id, preorder_id) = 1);

create unique index if not exists idx_refunds_provider_refund_id
  on public.refunds(provider_refund_id)
  where provider_refund_id is not null;

-- Supabase Data API exposure is grant + RLS. Keep grants explicit so new
-- projects with opt-in exposure behave the same as older projects.
grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.tcg_categories,
  public.sets_releases,
  public.products,
  public.product_variants,
  public.booster_box_skus,
  public.inventory
to anon, authenticated;

grant select, update on table public.customers to authenticated;
grant select on table
  public.b2b_accounts,
  public.preorders,
  public.orders,
  public.order_items,
  public.payments,
  public.shipments,
  public.notifications
to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;

drop policy if exists "catalog readable" on public.tcg_categories;
drop policy if exists "catalog readable" on public.sets_releases;
drop policy if exists "catalog readable" on public.products;
drop policy if exists "catalog readable" on public.product_variants;
drop policy if exists "catalog readable" on public.booster_box_skus;
drop policy if exists "availability readable" on public.inventory;

create policy "catalog readable" on public.tcg_categories
  for select to anon, authenticated using (true);
create policy "catalog readable" on public.sets_releases
  for select to anon, authenticated using (true);
create policy "catalog readable" on public.products
  for select to anon, authenticated using (active);
create policy "catalog readable" on public.product_variants
  for select to anon, authenticated using (true);
create policy "catalog readable" on public.booster_box_skus
  for select to anon, authenticated using (true);
create policy "availability readable" on public.inventory
  for select to anon, authenticated using (true);

drop policy if exists "own customer row select" on public.customers;
drop policy if exists "own customer row update" on public.customers;
drop policy if exists "own preorders" on public.preorders;
drop policy if exists "own orders" on public.orders;
drop policy if exists "own order items" on public.order_items;
drop policy if exists "own payments" on public.payments;
drop policy if exists "own shipments" on public.shipments;
drop policy if exists "own b2b account" on public.b2b_accounts;
drop policy if exists "own notifications" on public.notifications;

create policy "own customer row select" on public.customers
  for select to authenticated
  using ((select auth.uid()) = auth_user_id);

create policy "own customer row update" on public.customers
  for update to authenticated
  using ((select auth.uid()) = auth_user_id)
  with check ((select auth.uid()) = auth_user_id);

create policy "own preorders" on public.preorders
  for select to authenticated
  using (
    customer_id in (
      select id from public.customers where auth_user_id = (select auth.uid())
    )
  );

create policy "own orders" on public.orders
  for select to authenticated
  using (
    customer_id in (
      select id from public.customers where auth_user_id = (select auth.uid())
    )
  );

create policy "own order items" on public.order_items
  for select to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.auth_user_id = (select auth.uid())
    )
  );

create policy "own payments" on public.payments
  for select to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.auth_user_id = (select auth.uid())
    )
    or preorder_id in (
      select p.id
      from public.preorders p
      join public.customers c on c.id = p.customer_id
      where c.auth_user_id = (select auth.uid())
    )
  );

create policy "own shipments" on public.shipments
  for select to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.auth_user_id = (select auth.uid())
    )
  );

create policy "own b2b account" on public.b2b_accounts
  for select to authenticated
  using (
    customer_id in (
      select id from public.customers where auth_user_id = (select auth.uid())
    )
  );

create policy "own notifications" on public.notifications
  for select to authenticated
  using (
    customer_id in (
      select id from public.customers where auth_user_id = (select auth.uid())
    )
  );

drop function if exists public.create_checkout_order(uuid, uuid, integer, public.sales_channel);
drop function if exists public.create_checkout_order_from_cart(uuid, jsonb, public.sales_channel);

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
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item record;
  v_unit_price integer;
  v_currency text;
  v_line_currency text;
  v_subtotal integer := 0;
  v_total_quantity integer := 0;
  v_total integer;
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

  if p_channel = 'b2b' and p_expected_total_cents is null then
    raise exception 'b2b checkout requires a pricing contract' using errcode = '22023';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.auth_user_id = p_auth_user_id;

  if v_customer_id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  insert into public.orders (
    customer_id,
    channel,
    status,
    subtotal_cents,
    discount_cents,
    discount_bps,
    total_cents,
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

  v_total := v_subtotal - p_discount_cents;

  if p_expected_total_cents is not null and p_expected_total_cents <> v_total then
    raise exception 'checkout total changed' using errcode = 'P0001';
  end if;

  update public.orders
     set currency = v_currency,
         subtotal_cents = v_subtotal,
         discount_cents = p_discount_cents,
         discount_bps = p_discount_bps,
         shipping_cents = 0,
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
  uuid,
  jsonb,
  public.sales_channel,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_from_cart(
  uuid,
  jsonb,
  public.sales_channel,
  integer,
  integer,
  integer,
  integer
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
  v_status public.order_status;
  v_total_cents integer;
  v_currency text;
begin
  select customer_id, status, total_cents, upper(currency)
    into v_customer_id, v_status, v_total_cents, v_currency
  from public.orders
  where id = p_order_id;

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
        updated_at = now();
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, integer, text)
  to service_role;
