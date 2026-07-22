-- Complete the product-only cutover. This intentionally discards operational data;
-- ADR 0001 rejects compatibility with the former variant/sellable-unit hierarchy.

begin;

truncate table
  public.refunds,
  public.payments,
  public.shipments,
  public.order_items,
  public.preorders,
  public.orders,
  public.purchase_order_items,
  public.purchase_orders,
  public.allocation_rules
restart identity cascade;

alter table public.purchase_order_items rename column sku_id to product_id;
alter table public.preorders rename column sku_id to product_id;
alter table public.order_items rename column sku_id to product_id;
alter table public.allocation_rules rename column sku_id to product_id;

alter index if exists public.idx_preorders_sku
  rename to idx_preorders_product;
alter index if exists public.idx_preorders_sku_status_created
  rename to idx_preorders_product_status_created;
alter index if exists public.idx_limited_time_deals_sku_window
  rename to idx_limited_time_deals_product_window;
alter index if exists public.idx_waitlist_entries_sku_status_created
  rename to idx_waitlist_entries_product_status_created;

drop table if exists public.sku_prices cascade;
drop table if exists public.inventory cascade;
drop table if exists public.booster_box_skus cascade;
drop table if exists public.product_variants cascade;

drop function if exists public.admin_upsert_booster_box_sku(
  uuid, uuid, text, text, integer, integer, integer, integer, text, integer, boolean, text
) cascade;
drop function if exists public.admin_set_booster_box_sku_active(uuid, boolean, text) cascade;
drop function if exists public.admin_upsert_catalog_sku(
  uuid, uuid, text, text, integer, integer, integer, boolean, uuid
) cascade;
drop function if exists public.admin_set_sku_price(uuid, text, integer, integer, uuid) cascade;
drop function if exists public.enforce_listing_sellable_sku() cascade;
drop function if exists public.unpublish_listing_without_sellable_sku() cascade;
drop function if exists public.sync_sku_price_cache() cascade;
drop function if exists public.create_checkout_order(
  uuid, uuid, integer, public.sales_channel
) cascade;
drop function if exists public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel
) cascade;
drop function if exists public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, integer, integer, integer, integer
) cascade;
drop function if exists public.admin_cancel_unpaid_order(uuid, text, text) cascade;
drop function if exists public.admin_record_manual_reconciliation(
  uuid, text, text, integer, text, text, text
) cascade;
drop function if exists public.apply_preorder_allocations(uuid, jsonb, text) cascade;
drop function if exists public.mark_preorder_balance_paid(
  uuid, text, integer, text
) cascade;
drop function if exists public.admin_upsert_limited_time_deal(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, text
) cascade;
drop function if exists public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
) cascade;
drop function if exists public.admin_create_tcgplayer_catalog_product(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, bigint, jsonb, uuid
) cascade;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_data jsonb;
  v_record_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old_data := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new_data := to_jsonb(new); end if;
  v_record_data := coalesce(v_new_data, v_old_data, '{}'::jsonb);
  v_record_id := coalesce(
    v_record_data->>'id',
    (v_record_data->>'grant_id') || ':' || (v_record_data->>'permission_key'),
    v_record_data->>'key',
    v_record_data->>'order_id',
    v_record_data->>'product_id'
  );

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    coalesce(auth.uid()::text, 'service'),
    tg_table_name,
    v_record_id,
    tg_op,
    v_old_data,
    v_new_data
  );
  return coalesce(new, old);
end;
$$;

alter table public.purchase_order_items
  add constraint purchase_order_items_product_id_fkey
  foreign key (product_id) references public.products(id);
alter table public.preorders
  add constraint preorders_product_id_fkey
  foreign key (product_id) references public.products(id);
alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id);
alter table public.allocation_rules
  drop constraint if exists allocation_rules_scope,
  add constraint allocation_rules_product_id_fkey
    foreign key (product_id) references public.products(id),
  add constraint allocation_rules_scope
    check (set_id is not null or product_id is not null);

create or replace function public.product_is_sellable(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.products product
    join public.product_inventory inventory_row
      on inventory_row.product_id = product.id and inventory_row.location = 'main'
    where product.id = p_product_id
      and product.active
      and product.price_cents > 0
      and greatest(0, inventory_row.available - inventory_row.safety_stock) > 0
  );
$$;
revoke all on function public.product_is_sellable(uuid) from public, anon, authenticated;
grant execute on function public.product_is_sellable(uuid) to service_role;

create or replace function public.enforce_listing_sellable_product()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.published and not public.product_is_sellable(new.product_id) then
    raise exception 'published listing requires a sellable product' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger enforce_listing_sellable_product
  before insert or update of published, product_id on public.listing_items
  for each row execute function public.enforce_listing_sellable_product();

create or replace function public.unpublish_listing_without_sellable_product()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_product_id uuid;
begin
  if tg_table_name = 'products' then
    v_product_id := new.id;
  else
    v_product_id := coalesce(new.product_id, old.product_id);
  end if;
  if not public.product_is_sellable(v_product_id) then
    update public.listing_items set published = false
    where product_id = v_product_id and published;
  end if;
  return new;
end;
$$;
create trigger unpublish_listing_after_product_change
  after update of active, price_cents on public.products
  for each row execute function public.unpublish_listing_without_sellable_product();
create trigger unpublish_listing_after_inventory_change
  after insert or update of on_hand, allocated, safety_stock on public.product_inventory
  for each row execute function public.unpublish_listing_without_sellable_product();

create or replace function public.admin_upsert_storefront_listing(
  p_product_id uuid,
  p_title_override text,
  p_badge_label text,
  p_tags text[],
  p_max_per_customer integer,
  p_preorder_reserve integer,
  p_sort_priority integer,
  p_featured boolean,
  p_availability_mode text,
  p_order_open_at timestamptz,
  p_order_close_at timestamptz,
  p_release_date date,
  p_actor_auth_user_id uuid
)
returns table (listing_item_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'storefront.manage') then
    raise exception 'storefront management permission required' using errcode = '42501';
  end if;
  if p_availability_mode not in ('available_now', 'preorder', 'coming_soon', 'unavailable') then
    raise exception 'invalid listing availability mode' using errcode = '22023';
  end if;
  if p_order_open_at is not null and p_order_close_at is not null
     and p_order_close_at <= p_order_open_at then
    raise exception 'order close must be after order open' using errcode = '22023';
  end if;

  insert into public.listing_items as listing (
    product_id, title_override, badge_label, tags, channels,
    max_per_customer, preorder_reserve, sort_priority, featured,
    availability_mode, order_open_at, order_close_at, release_date, published
  ) values (
    p_product_id, nullif(trim(coalesce(p_title_override, '')), ''),
    nullif(trim(coalesce(p_badge_label, '')), ''), coalesce(p_tags, array[]::text[]),
    array['b2c']::text[], p_max_per_customer, coalesce(p_preorder_reserve, 0),
    coalesce(p_sort_priority, 0), coalesce(p_featured, false), p_availability_mode,
    p_order_open_at, p_order_close_at, p_release_date, false
  )
  on conflict on constraint listing_items_product_id_key do update set
    title_override = excluded.title_override,
    badge_label = excluded.badge_label,
    tags = excluded.tags,
    max_per_customer = excluded.max_per_customer,
    preorder_reserve = excluded.preorder_reserve,
    sort_priority = excluded.sort_priority,
    featured = excluded.featured,
    availability_mode = excluded.availability_mode,
    order_open_at = excluded.order_open_at,
    order_close_at = excluded.order_close_at,
    release_date = excluded.release_date,
    updated_at = now()
  returning listing.id into v_id;
  return query select v_id;
end;
$$;

create or replace function public.admin_set_listing_publication(
  p_product_id uuid,
  p_published boolean,
  p_actor_auth_user_id uuid
)
returns table (listing_item_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listing_items%rowtype;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'storefront.publish') then
    raise exception 'storefront publication permission required' using errcode = '42501';
  end if;
  select * into v_listing from public.listing_items where product_id = p_product_id;
  if v_listing.id is null then raise exception 'listing not found' using errcode = 'P0002'; end if;
  if coalesce(p_published, false) then
    if not exists (
      select 1 from public.products
      where id = p_product_id and active and reference_code is not null
    ) then
      raise exception 'an active physical product is required before publishing' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.product_prices
      where product_id = p_product_id and active and starts_at <= now()
        and (ends_at is null or ends_at > now())
    ) then
      raise exception 'a current product price is required before publishing' using errcode = '23514';
    end if;
    if v_listing.availability_mode = 'available_now'
       and not public.product_is_sellable(p_product_id) then
      raise exception 'available-now publication requires sellable inventory' using errcode = '23514';
    end if;
  end if;
  update public.listing_items set published = coalesce(p_published, false), updated_at = now()
  where id = v_listing.id;
  return query select v_listing.id;
end;
$$;

revoke all on function public.admin_upsert_storefront_listing(
  uuid, text, text, text[], integer, integer, integer, boolean,
  text, timestamptz, timestamptz, date, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_storefront_listing(
  uuid, text, text, text[], integer, integer, integer, boolean,
  text, timestamptz, timestamptz, date, uuid
) to service_role;
revoke all on function public.admin_set_listing_publication(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_listing_publication(uuid, boolean, uuid)
  to service_role;

create or replace function public.admin_set_pricing_promotion_active(
  p_deal_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.approve') then
    raise exception 'sensitive pricing approval required' using errcode = '42501';
  end if;
  update public.limited_time_deals set active = coalesce(p_active, false), updated_at = now()
  where id = p_deal_id;
  if not found then raise exception 'promotion not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  to service_role;

create or replace function public.validate_limited_time_deal_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original_price_cents integer;
begin
  select product.price_cents into v_original_price_cents
  from public.products product
  where product.id = new.product_id;

  if v_original_price_cents is null then
    raise exception 'deal product not found' using errcode = 'P0002';
  end if;
  if v_original_price_cents <= 0 then
    raise exception 'deal product must have a positive original price' using errcode = '22023';
  end if;
  if new.deal_price_cents is null
     or new.deal_price_cents <= 0
     or new.deal_price_cents >= v_original_price_cents then
    raise exception 'deal price must be positive and lower than the original price'
      using errcode = '22023';
  end if;

  new.discount_bps := greatest(
    1,
    least(
      9999,
      round(
        ((v_original_price_cents - new.deal_price_cents)::numeric * 10000)
        / v_original_price_cents::numeric
      )::integer
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_validate_limited_time_deal_price
  on public.limited_time_deals;
create trigger trg_validate_limited_time_deal_price
before insert or update of product_id, deal_price_cents
on public.limited_time_deals
for each row execute function public.validate_limited_time_deal_price();

drop function if exists public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, uuid
);

create or replace function public.admin_adjust_inventory(
  p_product_id uuid,
  p_on_hand integer,
  p_incoming integer,
  p_safety_stock integer,
  p_reason_code text,
  p_reason_note text,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before record;
  v_after record;
  v_reason text := lower(trim(coalesce(p_reason_code, '')));
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'inventory.adjust') then
    raise exception 'inventory management permission required' using errcode = '42501';
  end if;
  if v_reason not in ('stock_count', 'damage', 'supplier_update', 'correction', 'other') then
    raise exception 'invalid inventory reason code' using errcode = '22023';
  end if;
  if p_on_hand < 0 or p_incoming < 0 or p_safety_stock < 0 then
    raise exception 'inventory quantities must be non-negative' using errcode = '22023';
  end if;
  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

  select * into v_before from public.product_inventory
  where product_id = p_product_id and location = 'main' for update;

  insert into public.product_inventory as inventory_row (
    product_id, location, on_hand, incoming, safety_stock
  ) values (
    p_product_id, 'main', p_on_hand, p_incoming, p_safety_stock
  )
  on conflict (product_id, location) do update
  set on_hand = excluded.on_hand,
      incoming = excluded.incoming,
      safety_stock = excluded.safety_stock,
      updated_at = now()
  returning * into v_after;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'product_inventory', v_after.id::text,
    'ADMIN_INVENTORY_ADJUSTMENT', to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object(
      'reason_code', v_reason,
      'reason_note', nullif(trim(coalesce(p_reason_note, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, uuid
) to service_role;

drop function if exists public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, uuid
);

create or replace function public.admin_create_supplier_purchase_order(
  p_supplier_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_currency text,
  p_expected_at date,
  p_notes text,
  p_actor_auth_user_id uuid
)
returns table (purchase_order_id uuid, purchase_order_item_id uuid, incoming integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_incoming integer;
  v_total bigint;
  v_currency text := upper(trim(p_currency));
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'purchase_orders.manage') then
    raise exception 'purchase order permission required' using errcode = '42501';
  end if;
  if p_quantity <= 0 or p_unit_cost_cents < 0 then
    raise exception 'purchase order values are invalid' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency is invalid' using errcode = '22023';
  end if;
  v_total := p_quantity::bigint * p_unit_cost_cents::bigint;
  if v_total > 2147483647 then
    raise exception 'purchase order total exceeds supported range' using errcode = '22003';
  end if;
  perform 1 from public.suppliers where id = p_supplier_id;
  if not found then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

  insert into public.purchase_orders (
    supplier_id, status, currency, placed_at, expected_at, total_cents, notes
  ) values (
    p_supplier_id, 'confirmed', v_currency, now(), p_expected_at,
    v_total::integer, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_order_id;

  insert into public.purchase_order_items (
    purchase_order_id, product_id, quantity, unit_cost_cents
  ) values (
    v_order_id, p_product_id, p_quantity, p_unit_cost_cents
  ) returning id into v_item_id;

  insert into public.product_inventory as inventory_row (product_id, location, incoming)
  values (p_product_id, 'main', p_quantity)
  on conflict (product_id, location) do update
  set incoming = inventory_row.incoming + excluded.incoming,
      updated_at = now()
  returning inventory_row.incoming into v_incoming;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'purchase_orders', v_order_id::text,
    'ADMIN_SUPPLIER_PO_INTAKE',
    jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity)
  );
  return query select v_order_id, v_item_id, v_incoming;
end;
$$;

revoke all on function public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, uuid
) to service_role;

drop function if exists public.create_checkout_order_from_cart(
  uuid, jsonb, public.sales_channel, jsonb, integer, integer, integer, integer
);

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
  currency text,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item record;
  v_product record;
  v_currency text;
  v_subtotal integer := 0;
  v_quantity integer := 0;
  v_shipping integer;
  v_policy jsonb;
  v_policy_active boolean;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'cart must contain between 1 and 10 products' using errcode = '22023';
  end if;
  if jsonb_typeof(p_shipping_address) <> 'object'
     or trim(coalesce(p_shipping_address->>'recipientName', '')) = ''
     or trim(coalesce(p_shipping_address->>'line1', '')) = ''
     or trim(coalesce(p_shipping_address->>'postalCode', '')) = '' then
    raise exception 'shipping address is incomplete' using errcode = '22023';
  end if;
  select id into v_customer_id from public.customers where auth_user_id = p_auth_user_id;
  if v_customer_id is null then raise exception 'customer not found' using errcode = 'P0002'; end if;

  select value, active into v_policy, v_policy_active
  from public.storefront_configurations where "key" = 'shipping_policy';
  if not coalesce(v_policy_active, false)
     or lower(coalesce(v_policy->>'enabled', 'false')) <> 'true' then
    raise exception 'shipping checkout is not configured' using errcode = 'P0001';
  end if;

  insert into public.orders (
    customer_id, channel, status, currency, subtotal_cents, discount_cents,
    discount_bps, shipping_cents, total_cents, shipping_address,
    shipping_service, shipping_policy_key, checkout_reserved_until, placed_at
  ) values (
    v_customer_id, p_channel, 'pending_payment', 'SGD', 0, 0, 0, 0, 0,
    p_shipping_address, nullif(trim(v_policy->>'serviceName'), ''),
    'shipping_policy', v_expires_at, now()
  ) returning id into v_order_id;

  for v_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  loop
    if v_item.quantity not between 1 and 24 then
      raise exception 'invalid quantity' using errcode = '22023';
    end if;
    v_quantity := v_quantity + v_item.quantity;
    if v_quantity > 24 then raise exception 'cart quantity limit exceeded' using errcode = '22023'; end if;

    select id, price_cents, currency into v_product
    from public.products
    where id = v_item.product_id and active and price_cents > 0;
    if v_product.id is null then raise exception 'product not available' using errcode = 'P0002'; end if;
    if v_currency is null then v_currency := upper(v_product.currency);
    elsif v_currency <> upper(v_product.currency) then
      raise exception 'mixed-currency carts are not supported' using errcode = '22023';
    end if;

    update public.product_inventory
    set allocated = allocated + v_item.quantity
    where product_id = v_item.product_id and location = 'main'
      and greatest(0, available - safety_stock) >= v_item.quantity;
    if not found then raise exception 'insufficient inventory' using errcode = 'P0001'; end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price_cents)
    values (v_order_id, v_item.product_id, v_item.quantity, v_product.price_cents);
    v_subtotal := v_subtotal + v_product.price_cents * v_item.quantity;
  end loop;

  if p_expected_subtotal_cents <> v_subtotal then
    raise exception 'checkout subtotal changed' using errcode = 'P0001';
  end if;
  v_shipping := case
    when nullif(v_policy->>'freeShippingThresholdCents', '')::integer is not null
      and v_subtotal - p_discount_cents >= (v_policy->>'freeShippingThresholdCents')::integer
    then 0 else (v_policy->>'flatRateCents')::integer
  end;
  if p_expected_total_cents <> v_subtotal - p_discount_cents + v_shipping then
    raise exception 'checkout total changed' using errcode = 'P0001';
  end if;

  update public.orders set
    currency = v_currency,
    subtotal_cents = v_subtotal,
    discount_cents = p_discount_cents,
    discount_bps = p_discount_bps,
    shipping_cents = v_shipping,
    total_cents = p_expected_total_cents
  where id = v_order_id;

  return query select v_order_id, v_customer_id, v_subtotal, p_discount_cents,
    p_discount_bps, p_expected_total_cents, v_currency, v_expires_at;
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
set search_path = public, pg_temp
as $$
begin
  update public.product_inventory inventory_row
  set allocated = greatest(0, inventory_row.allocated - item.quantity)
  from public.order_items item
  where item.order_id = p_order_id
    and item.product_id = inventory_row.product_id
    and inventory_row.location = 'main';
  update public.orders set checkout_reserved_until = null where id = p_order_id;
end;
$$;
revoke all on function public.release_order_allocation(uuid) from public, anon, authenticated;
grant execute on function public.release_order_allocation(uuid) to service_role;

drop function if exists public.stage_preorder_allocations(uuid, jsonb, text, text);

create or replace function public.stage_preorder_allocations(
  p_product_id uuid,
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
set search_path = public, pg_temp
as $$
declare
  v_inventory record;
  v_candidate record;
  v_preorder record;
  v_payment record;
  v_total integer := 0;
begin
  select * into v_inventory from public.product_inventory
  where product_id = p_product_id and location = 'main' for update;
  if v_inventory.id is null then raise exception 'inventory not found' using errcode = 'P0002'; end if;

  for v_candidate in
    select preorder_id, allocated
    from jsonb_to_recordset(p_allocations) as item(preorder_id uuid, allocated integer)
  loop
    select * into v_preorder from public.preorders
    where id = v_candidate.preorder_id and product_id = p_product_id and status = 'paid'
    for update;
    if v_preorder.id is null or v_candidate.allocated not between 0 and v_preorder.quantity then
      raise exception 'allocation preview is stale' using errcode = 'P0001';
    end if;
    v_total := v_total + v_candidate.allocated;
  end loop;
  if v_total > greatest(0, v_inventory.on_hand + v_inventory.incoming
      - v_inventory.allocated - v_inventory.safety_stock) then
    raise exception 'allocation stock changed' using errcode = 'P0001';
  end if;
  update public.product_inventory set allocated = allocated + v_total where id = v_inventory.id;

  for v_candidate in
    select preorder_id, allocated
    from jsonb_to_recordset(p_allocations) as item(preorder_id uuid, allocated integer)
  loop
    update public.preorders set
      allocated_qty = v_candidate.allocated,
      allocation_refund_cents = (quantity - v_candidate.allocated) * unit_price_cents,
      allocation_confirmed_at = now(), allocation_actor = trim(p_actor),
      allocation_fingerprint = trim(p_fingerprint),
      status = case when v_candidate.allocated < quantity
        then 'refund_pending'::public.preorder_status else 'allocated'::public.preorder_status end
    where id = v_candidate.preorder_id;
  end loop;

  return query
  select preorder.id, preorder.allocated_qty, preorder.allocation_refund_cents,
    payment.id, payment.provider_payment_id, preorder.currency
  from public.preorders preorder
  join lateral (
    select p.id, p.provider_payment_id from public.payments p
    where p.preorder_id = preorder.id and p.kind = 'full' and p.status = 'captured'
    order by p.captured_at desc nulls last limit 1
  ) payment on true
  where preorder.product_id = p_product_id
    and preorder.allocation_fingerprint = trim(p_fingerprint)
    and preorder.status in ('allocated', 'refund_pending');
end;
$$;
revoke all on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  to service_role;

-- Rebind the existing finalizer body to the renamed product columns.
create or replace function public.finalize_preorder_allocation(
  p_preorder_id uuid,
  p_provider_refund_id text,
  p_refund_status text,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_preorder record;
  v_payment record;
  v_order_id uuid;
  v_total integer;
begin
  select * into v_preorder from public.preorders where id = p_preorder_id for update;
  if v_preorder.id is null then raise exception 'preorder not found' using errcode = 'P0002'; end if;
  if v_preorder.status = 'converted' then return v_preorder.order_id; end if;
  if v_preorder.status not in ('allocated', 'refund_pending') then
    raise exception 'preorder allocation is not staged' using errcode = 'P0001';
  end if;
  select * into v_payment from public.payments
  where preorder_id = p_preorder_id and kind = 'full' and status = 'captured'
  order by captured_at desc nulls last limit 1 for update;
  if v_payment.id is null then raise exception 'captured payment not found' using errcode = 'P0002'; end if;

  if v_preorder.allocation_refund_cents > 0 then
    if nullif(trim(p_provider_refund_id), '') is null then
      raise exception 'refund confirmation required' using errcode = '22023';
    end if;
    insert into public.refunds (
      payment_id, provider_refund_id, amount_cents, currency, reason, status
    ) values (
      v_payment.id, trim(p_provider_refund_id), v_preorder.allocation_refund_cents,
      v_preorder.currency, 'preorder_allocation_shortfall',
      case lower(coalesce(p_refund_status, 'pending'))
        when 'succeeded' then 'succeeded'::public.refund_status
        when 'failed' then 'failed'::public.refund_status
        else 'pending'::public.refund_status end
    );
  end if;

  if v_preorder.allocated_qty > 0 then
    v_total := v_preorder.allocated_qty * v_preorder.unit_price_cents;
    insert into public.orders (
      customer_id, channel, status, currency, subtotal_cents, total_cents, placed_at
    ) values (
      v_preorder.customer_id, v_preorder.channel, 'paid', v_preorder.currency,
      v_total, v_total, now()
    ) returning id into v_order_id;
    insert into public.order_items (
      order_id, product_id, preorder_id, quantity, unit_price_cents
    ) values (
      v_order_id, v_preorder.product_id, p_preorder_id,
      v_preorder.allocated_qty, v_preorder.unit_price_cents
    );
    update public.preorders set status = 'converted', order_id = v_order_id,
      balance_cents = 0 where id = p_preorder_id;
  else
    update public.preorders set status = 'refunded', balance_cents = 0
    where id = p_preorder_id;
  end if;
  return v_order_id;
end;
$$;
revoke all on function public.finalize_preorder_allocation(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_preorder_allocation(uuid, text, text, text)
  to service_role;

create or replace function public.settle_order_payment(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_order.status = 'paid' then return 'paid'; end if;
  if v_order.status <> 'pending_payment' then return 'not_payable'; end if;
  if v_order.checkout_reserved_until is null or v_order.checkout_reserved_until <= now() then
    perform public.release_order_allocation(p_order_id);
    update public.orders set status = 'cancelled' where id = p_order_id;
    return 'expired';
  end if;
  if p_amount_cents <> v_order.total_cents
     or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'payment amount or currency mismatch' using errcode = 'P0001';
  end if;

  update public.product_inventory inventory_row
  set allocated = greatest(0, inventory_row.allocated - item.quantity),
      on_hand = greatest(0, inventory_row.on_hand - item.quantity)
  from public.order_items item
  where item.order_id = p_order_id
    and item.product_id = inventory_row.product_id
    and inventory_row.location = 'main';
  update public.orders set status = 'paid', checkout_reserved_until = null
  where id = p_order_id;
  return 'paid';
end;
$$;
revoke all on function public.settle_order_payment(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_order_payment(uuid, text, integer, text)
  to service_role;

create or replace function public.expire_checkout_reservations(p_limit integer default 500)
returns table (order_id uuid, provider_payment_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  for v_order in
    select id from public.orders
    where status = 'pending_payment'
      and checkout_reserved_until <= now()
    order by checkout_reserved_until
    for update skip locked limit p_limit
  loop
    perform public.release_order_allocation(v_order.id);
    update public.payments set status = 'cancelled'
    where order_id = v_order.id and status in ('pending', 'requires_capture', 'authorized');
    update public.orders set status = 'cancelled', checkout_reserved_until = null
    where id = v_order.id;
    return query
      select v_order.id, payment.provider_payment_id
      from public.payments payment
      where payment.order_id = v_order.id
      order by payment.created_at desc limit 1;
  end loop;
end;
$$;
revoke all on function public.expire_checkout_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.expire_checkout_reservations(integer)
  to service_role;

commit;
