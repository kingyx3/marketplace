\set ON_ERROR_STOP on

begin;

do $$
declare
  v_product_id uuid;
  v_sku_id uuid;
  v_updated_sku_id uuid;
begin
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
  from public.admin_upsert_booster_box_sku(
    null,
    v_product_id,
    'CI-ADMIN-SKU-CREATE',
    'CI-ADMIN-SKU-BARCODE',
    36,
    10,
    22000,
    19900,
    'SGD',
    900,
    true,
    'ci:admin-sku-creation'
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

  select result.sku_id
    into v_updated_sku_id
  from public.admin_upsert_booster_box_sku(
    v_sku_id,
    v_product_id,
    'CI-ADMIN-SKU-CREATE',
    'CI-ADMIN-SKU-BARCODE',
    36,
    10,
    22000,
    18900,
    'SGD',
    900,
    true,
    'ci:admin-sku-update'
  ) as result;

  if v_updated_sku_id is distinct from v_sku_id then
    raise exception 'admin SKU update returned an unexpected id: %', v_updated_sku_id;
  end if;

  if not exists (
    select 1
    from public.booster_box_skus s
    where s.id = v_sku_id
      and s.price_cents = 18900
      and s.active
  ) then
    raise exception 'admin SKU update was not persisted';
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
