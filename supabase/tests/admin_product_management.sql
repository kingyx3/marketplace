\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor_auth_user_id uuid := '10000000-0000-4000-8000-000000000129';
  v_product_id uuid;
  v_category_id uuid;
  v_set_id uuid;
  v_price_id uuid;
begin
  insert into auth.users (id, email)
  values (v_actor_auth_user_id, 'admin-product-contract@example.test');

  insert into public.staff_users (auth_user_id, role, active, email, source)
  values (
    v_actor_auth_user_id,
    'owner',
    true,
    'admin-product-contract@example.test',
    'environment'
  );

  select product.id, product.category_id, product.set_id
    into v_product_id, v_category_id, v_set_id
  from public.products product
  where product.reference_code = 'MTG-SMP-PBB-EN';

  if v_product_id is null then
    raise exception 'admin product contract requires the seeded product';
  end if;

  perform public.admin_update_catalog_product(
    v_product_id,
    'Admin Product Contract',
    v_category_id,
    v_set_id,
    'booster_box',
    'Updated through the product-only administration contract.',
    'EN',
    null,
    true,
    'ADMIN-PRODUCT-CONTRACT',
    '8888888888888',
    36,
    14,
    960,
    v_actor_auth_user_id
  );

  v_price_id := public.admin_set_product_price(
    v_product_id,
    'SGD',
    20500,
    22000,
    v_actor_auth_user_id
  );

  if v_price_id is null or not exists (
    select 1
    from public.products product
    where product.id = v_product_id
      and product.name = 'Admin Product Contract'
      and product.reference_code = 'ADMIN-PRODUCT-CONTRACT'
      and product.price_cents = 20500
      and product.compare_at_cents = 22000
  ) then
    raise exception 'admin product update was not persisted';
  end if;

  if not exists (
    select 1
    from public.product_prices price
    where price.id = v_price_id
      and price.product_id = v_product_id
      and price.price_cents = 20500
      and price.active
  ) then
    raise exception 'admin product pricing was not persisted';
  end if;

  if (
    select count(*)
    from public.product_inventory inventory_row
    where inventory_row.product_id = v_product_id
      and inventory_row.location = 'main'
  ) <> 1 then
    raise exception 'product administration changed the inventory identity';
  end if;
end;
$$;

rollback;
