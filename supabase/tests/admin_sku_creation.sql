\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor_auth_user_id uuid := '10000000-0000-4000-8000-000000000099';
  v_product_id uuid;
  v_sku_id uuid;
  v_price_id uuid;
  v_updated_sku_id uuid;
begin
  insert into auth.users (id, email)
  values (v_actor_auth_user_id, 'admin-sku-contract@example.test');

  insert into public.staff_users (
    auth_user_id, role, active, email, source
  ) values (
    v_actor_auth_user_id,
    'owner',
    true,
    'admin-sku-contract@example.test',
    'environment'
  );

  select p.id
    into v_product_id
  from public.products p
  order by p.created_at, p.id
  limit 1;

  if v_product_id is null then
    raise exception 'admin SKU creation contract requires a seeded product';
  end if;

  select result.sku_id
    into v_sku_id
  from public.admin_upsert_catalog_sku(
    null,
    v_product_id,
    'CI-ADMIN-SKU-CREATE',
    'CI-ADMIN-SKU-BARCODE',
    36,
    10,
    900,
    true,
    v_actor_auth_user_id
  ) as result;

  if v_sku_id is null then
    raise exception 'admin SKU creation did not return an id';
  end if;

  if not exists (
    select 1
    from public.inventory i
    where i.sku_id = v_sku_id
      and i.location = 'main'
  ) then
    raise exception 'admin SKU creation did not provision main inventory';
  end if;

  select result.price_id
    into v_price_id
  from public.admin_set_sku_price(
    v_sku_id,
    'SGD',
    19900,
    22000,
    v_actor_auth_user_id
  ) as result;

  if v_price_id is null or not exists (
    select 1
    from public.sku_prices price
    where price.id = v_price_id
      and price.sku_id = v_sku_id
      and price.price_cents = 19900
      and price.compare_at_cents = 22000
      and price.active
  ) then
    raise exception 'admin SKU pricing was not persisted independently';
  end if;

  select result.sku_id
    into v_updated_sku_id
  from public.admin_upsert_catalog_sku(
    v_sku_id,
    v_product_id,
    'CI-ADMIN-SKU-CREATE',
    'CI-ADMIN-SKU-BARCODE',
    36,
    10,
    950,
    true,
    v_actor_auth_user_id
  ) as result;

  if v_updated_sku_id is distinct from v_sku_id then
    raise exception 'admin SKU update returned an unexpected id: %', v_updated_sku_id;
  end if;

  if not exists (
    select 1
    from public.booster_box_skus s
    where s.id = v_sku_id
      and s.weight_grams = 950
      and s.price_cents = 19900
      and s.active
  ) then
    raise exception 'admin SKU update was not persisted or changed pricing';
  end if;

  if (
    select count(*)
    from public.inventory i
    where i.sku_id = v_sku_id
      and i.location = 'main'
  ) <> 1 then
    raise exception 'admin SKU update created duplicate inventory rows';
  end if;
end;
$$;

rollback;
