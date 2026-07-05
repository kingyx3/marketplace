-- Audited admin catalog management.
-- Adds SKU archive state, product/SKU service-role RPCs, image URL updates,
-- reasoned inventory adjustment, and archived-SKU checkout guards.

alter table public.booster_box_skus
  add column if not exists active boolean not null default true;

drop trigger if exists audit_log on public.products;
create trigger audit_log
after insert or update or delete on public.products
for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.product_variants;
create trigger audit_log
after insert or update or delete on public.product_variants
for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.booster_box_skus;
create trigger audit_log
after insert or update or delete on public.booster_box_skus
for each row execute function public.write_audit_log();

create or replace function public.admin_upsert_catalog_product(
  p_product_id uuid,
  p_category_id uuid,
  p_set_id uuid,
  p_slug text,
  p_name text,
  p_product_type text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_actor text
)
returns table (product_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_product_type text := lower(trim(coalesce(p_product_type, '')));
  v_language text := upper(trim(coalesce(p_language, 'EN')));
  v_product_id uuid;
  v_action text;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lowercase words separated by hyphens' using errcode = '22023';
  end if;

  if v_name = '' then
    raise exception 'product name required' using errcode = '22023';
  end if;

  if v_product_type !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'product type required' using errcode = '22023';
  end if;

  if v_language !~ '^[A-Z]{2,8}$' then
    raise exception 'language code is invalid' using errcode = '22023';
  end if;

  perform 1 from public.tcg_categories where id = p_category_id;
  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  if p_set_id is not null then
    perform 1
    from public.sets_releases
    where id = p_set_id
      and category_id = p_category_id;
    if not found then
      raise exception 'set not found for category' using errcode = 'P0002';
    end if;
  end if;

  if p_product_id is null then
    insert into public.products (
      category_id,
      set_id,
      slug,
      name,
      product_type,
      description,
      language,
      image_url,
      active
    )
    values (
      p_category_id,
      p_set_id,
      v_slug,
      v_name,
      v_product_type,
      nullif(trim(coalesce(p_description, '')), ''),
      v_language,
      nullif(trim(coalesce(p_image_url, '')), ''),
      coalesce(p_active, true)
    )
    returning id into v_product_id;
    v_action := 'ADMIN_PRODUCT_CREATE';
  else
    update public.products
       set category_id = p_category_id,
           set_id = p_set_id,
           slug = v_slug,
           name = v_name,
           product_type = v_product_type,
           description = nullif(trim(coalesce(p_description, '')), ''),
           language = v_language,
           image_url = nullif(trim(coalesce(p_image_url, '')), ''),
           active = coalesce(p_active, true)
     where id = p_product_id
     returning id into v_product_id;

    if v_product_id is null then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
    v_action := 'ADMIN_PRODUCT_UPDATE';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'products',
    v_product_id::text,
    v_action,
    jsonb_build_object(
      'product_id', v_product_id,
      'slug', v_slug,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_product_id;
end;
$$;

create or replace function public.admin_set_product_active(
  p_product_id uuid,
  p_active boolean,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  update public.products
     set active = coalesce(p_active, false)
   where id = p_product_id;

  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'products',
    p_product_id::text,
    case when coalesce(p_active, false) then 'ADMIN_PRODUCT_RESTORE' else 'ADMIN_PRODUCT_ARCHIVE' end,
    jsonb_build_object('product_id', p_product_id, 'active', coalesce(p_active, false))
  );
end;
$$;

create or replace function public.admin_set_product_image(
  p_product_id uuid,
  p_image_url text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_url text := nullif(trim(coalesce(p_image_url, '')), '');
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_image_url is null then
    raise exception 'image url required' using errcode = '22023';
  end if;

  update public.products
     set image_url = v_image_url
   where id = p_product_id;

  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'products',
    p_product_id::text,
    'ADMIN_PRODUCT_IMAGE_SET',
    jsonb_build_object('product_id', p_product_id, 'image_url', v_image_url)
  );
end;
$$;

create or replace function public.admin_upsert_booster_box_sku(
  p_sku_id uuid,
  p_product_id uuid,
  p_sku text,
  p_barcode text,
  p_packs_per_box integer,
  p_cards_per_pack integer,
  p_msrp_cents integer,
  p_price_cents integer,
  p_currency text,
  p_weight_grams integer,
  p_active boolean,
  p_actor text
)
returns table (sku_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant_id uuid;
  v_sku text := upper(trim(coalesce(p_sku, '')));
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_sku_id uuid;
  v_action text;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_sku = '' then
    raise exception 'sku required' using errcode = '22023';
  end if;

  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'price must be non-negative' using errcode = '22023';
  end if;

  if p_msrp_cents is not null and p_msrp_cents < 0 then
    raise exception 'msrp must be non-negative' using errcode = '22023';
  end if;

  if p_packs_per_box is not null and p_packs_per_box < 0 then
    raise exception 'packs per box must be non-negative' using errcode = '22023';
  end if;

  if p_cards_per_pack is not null and p_cards_per_pack < 0 then
    raise exception 'cards per pack must be non-negative' using errcode = '22023';
  end if;

  if p_weight_grams is not null and p_weight_grams < 0 then
    raise exception 'weight must be non-negative' using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be ISO-4217 style code' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  insert into public.product_variants (product_id, name)
  values (p_product_id, 'default')
  on conflict (product_id, name) do update
    set updated_at = now()
  returning id into v_variant_id;

  if p_sku_id is null then
    insert into public.booster_box_skus (
      product_variant_id,
      sku,
      barcode,
      packs_per_box,
      cards_per_pack,
      msrp_cents,
      price_cents,
      currency,
      weight_grams,
      active
    )
    values (
      v_variant_id,
      v_sku,
      nullif(trim(coalesce(p_barcode, '')), ''),
      p_packs_per_box,
      p_cards_per_pack,
      p_msrp_cents,
      p_price_cents,
      v_currency,
      p_weight_grams,
      coalesce(p_active, true)
    )
    returning id into v_sku_id;
    v_action := 'ADMIN_SKU_CREATE';
  else
    update public.booster_box_skus
       set product_variant_id = v_variant_id,
           sku = v_sku,
           barcode = nullif(trim(coalesce(p_barcode, '')), ''),
           packs_per_box = p_packs_per_box,
           cards_per_pack = p_cards_per_pack,
           msrp_cents = p_msrp_cents,
           price_cents = p_price_cents,
           currency = v_currency,
           weight_grams = p_weight_grams,
           active = coalesce(p_active, true)
     where id = p_sku_id
     returning id into v_sku_id;

    if v_sku_id is null then
      raise exception 'sku not found' using errcode = 'P0002';
    end if;
    v_action := 'ADMIN_SKU_UPDATE';
  end if;

  insert into public.inventory (sku_id, location)
  values (v_sku_id, 'main')
  on conflict (sku_id, location) do nothing;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'booster_box_skus',
    v_sku_id::text,
    v_action,
    jsonb_build_object(
      'sku_id', v_sku_id,
      'product_id', p_product_id,
      'sku', v_sku,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_sku_id;
end;
$$;

create or replace function public.admin_set_booster_box_sku_active(
  p_sku_id uuid,
  p_active boolean,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  update public.booster_box_skus
     set active = coalesce(p_active, false)
   where id = p_sku_id;

  if not found then
    raise exception 'sku not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'booster_box_skus',
    p_sku_id::text,
    case when coalesce(p_active, false) then 'ADMIN_SKU_RESTORE' else 'ADMIN_SKU_ARCHIVE' end,
    jsonb_build_object('sku_id', p_sku_id, 'active', coalesce(p_active, false))
  );
end;
$$;

create or replace function public.admin_adjust_inventory(
  p_sku_id uuid,
  p_on_hand integer,
  p_incoming integer,
  p_safety_stock integer,
  p_reason_code text,
  p_reason_note text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason_code text := lower(trim(coalesce(p_reason_code, '')));
  v_before record;
  v_after record;
  v_had_inventory boolean;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_reason_code not in ('stock_count', 'damage', 'supplier_update', 'correction', 'other') then
    raise exception 'invalid inventory reason code' using errcode = '22023';
  end if;

  if p_on_hand is null or p_on_hand < 0
     or p_incoming is null or p_incoming < 0
     or p_safety_stock is null or p_safety_stock < 0 then
    raise exception 'inventory quantities must be non-negative' using errcode = '22023';
  end if;

  perform 1 from public.booster_box_skus where id = p_sku_id;
  if not found then
    raise exception 'sku not found' using errcode = 'P0002';
  end if;

  select * into v_before
  from public.inventory
  where sku_id = p_sku_id
    and location = 'main'
  for update;
  v_had_inventory := found;

  if not v_had_inventory then
    insert into public.inventory (sku_id, location, on_hand, incoming, safety_stock)
    values (p_sku_id, 'main', p_on_hand, p_incoming, p_safety_stock)
    returning * into v_after;
  else
    update public.inventory
       set on_hand = p_on_hand,
           incoming = p_incoming,
           safety_stock = p_safety_stock
     where id = v_before.id
     returning * into v_after;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'inventory',
    v_after.id::text,
    'ADMIN_INVENTORY_ADJUSTMENT',
    case when v_had_inventory then to_jsonb(v_before) else null end,
    to_jsonb(v_after) || jsonb_build_object(
      'reason_code', v_reason_code,
      'reason_note', nullif(trim(coalesce(p_reason_note, '')), '')
    )
  );
end;
$$;

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
    and s.active
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

  v_total := v_subtotal - p_discount_cents;

  if p_expected_total_cents is not null and p_expected_total_cents <> v_total then
    raise exception 'checkout total changed' using errcode = 'P0001';
  end if;

  update public.orders
     set currency = v_currency,
         subtotal_cents = v_subtotal,
         discount_cents = p_discount_cents,
         discount_bps = p_discount_bps,
         total_cents = v_total
   where id = v_order_id;

  return query
  select v_order_id, v_customer_id, v_subtotal, p_discount_cents, p_discount_bps,
         v_total, v_currency;
end;
$$;

revoke all on function public.admin_upsert_catalog_product(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_catalog_product(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text
) to service_role;

revoke all on function public.admin_set_product_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_product_active(uuid, boolean, text)
  to service_role;

revoke all on function public.admin_set_product_image(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_product_image(uuid, text, text)
  to service_role;

revoke all on function public.admin_upsert_booster_box_sku(
  uuid, uuid, text, text, integer, integer, integer, integer, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_booster_box_sku(
  uuid, uuid, text, text, integer, integer, integer, integer, text, integer, boolean, text
) to service_role;

revoke all on function public.admin_set_booster_box_sku_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_booster_box_sku_active(uuid, boolean, text)
  to service_role;

revoke all on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, text
) to service_role;

revoke all on function public.create_checkout_order(uuid, uuid, integer, public.sales_channel)
  from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid, uuid, integer, public.sales_channel)
  to service_role;

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
