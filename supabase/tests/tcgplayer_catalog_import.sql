\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor_auth_user_id uuid := '10000000-0000-4000-8000-000000000128';
  v_category_id uuid := '20000000-0000-4000-8000-000000000128';
  v_set_id uuid := '30000000-0000-4000-8000-000000000128';
  v_result record;
begin
  insert into auth.users (id, email)
  values (v_actor_auth_user_id, 'tcgplayer-import-contract@example.test');

  insert into public.staff_users (
    auth_user_id, role, active, email, source
  ) values (
    v_actor_auth_user_id,
    'owner',
    true,
    'tcgplayer-import-contract@example.test',
    'environment'
  );

  insert into public.tcg_categories (
    id, slug, name, publisher, active, sort_order
  ) values (
    v_category_id,
    'tcgplayer-import-contract',
    'TCGplayer Import Contract',
    'Contract Publisher',
    true,
    999
  );

  insert into public.sets_releases (
    id, category_id, name, code, status, active, sort_order
  ) values (
    v_set_id,
    v_category_id,
    'TCGplayer Import Contract Set',
    'TIC',
    'announced',
    true,
    999
  );

  insert into public.product_types (code, name, active, sort_order)
  values ('tcgplayer_contract', 'TCGplayer contract product', true, 999);

  select result.*
    into strict v_result
  from public.admin_create_tcgplayer_catalog_product(
    v_category_id,
    null,
    null,
    null,
    v_set_id,
    null,
    null,
    null,
    null,
    'tcgplayer_contract',
    null,
    null,
    'TCGplayer Import Ambiguity Contract Product',
    null,
    'EN',
    null,
    true,
    128000001,
    jsonb_build_array(
      jsonb_build_object(
        'sourceSkuId', 128000002,
        'sku', 'TCG-AMBIGUITY-128',
        'condition', 'Unopened',
        'language', 'English',
        'printing', 'Normal',
        'active', true
      )
    ),
    v_actor_auth_user_id
  ) as result;

  if v_result.product_id is null then
    raise exception 'TCGplayer catalog import did not return a product id';
  end if;

  if v_result.imported_sku_count <> 1 then
    raise exception 'TCGplayer catalog import returned an unexpected SKU count: %',
      v_result.imported_sku_count;
  end if;

  if not exists (
    select 1
    from public.booster_box_skus sku
    join public.product_variants variant
      on variant.id = sku.product_variant_id
    where variant.product_id = v_result.product_id
      and sku.sku = 'TCG-AMBIGUITY-128'
      and variant.name = 'tcgplayer:128000002'
  ) then
    raise exception 'TCGplayer catalog import did not persist the product SKU';
  end if;
end;
$$;

rollback;
