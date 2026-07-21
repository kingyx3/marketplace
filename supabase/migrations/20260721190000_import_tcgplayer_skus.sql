-- Create a TCGplayer-assisted catalog product and every returned physical SKU in one transaction.
-- TCGplayer prices remain reference metadata because commercial pricing is a separate permission domain.

begin;

create or replace function public.tcgplayer_positive_integer(p_value text, p_label text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_value bigint;
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then
    return null;
  end if;
  if trim(p_value) !~ '^\d+$' then
    raise exception '% must be a positive whole number', p_label using errcode = '22023';
  end if;
  v_value := trim(p_value)::bigint;
  if v_value <= 0 or v_value > 2147483647 then
    raise exception '% must be a positive whole number', p_label using errcode = '22023';
  end if;
  return v_value::integer;
end;
$$;

create or replace function public.admin_create_tcgplayer_catalog_product(
  p_category_id uuid,
  p_new_category_slug text,
  p_new_category_name text,
  p_new_category_publisher text,
  p_set_id uuid,
  p_new_set_name text,
  p_new_set_code text,
  p_new_set_release_date date,
  p_new_set_status public.set_status,
  p_product_type text,
  p_new_product_type_name text,
  p_new_product_type_code text,
  p_name text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_tcgplayer_product_id bigint,
  p_skus jsonb,
  p_actor_auth_user_id uuid
)
returns table (
  product_id uuid,
  product_slug text,
  category_id uuid,
  category_name text,
  category_created boolean,
  set_id uuid,
  set_name text,
  set_created boolean,
  product_type_code text,
  product_type_name text,
  product_type_created boolean,
  imported_sku_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product record;
  v_skus jsonb := coalesce(p_skus, '[]'::jsonb);
  v_item jsonb;
  v_ordinal bigint;
  v_source_sku_id bigint;
  v_source_condition_id bigint;
  v_source_language_id bigint;
  v_source_printing_id bigint;
  v_source_variant_id bigint;
  v_variant_name text;
  v_variant_id uuid;
  v_existing_sku_id uuid;
  v_existing_product_id uuid;
  v_sku_id uuid;
  v_sku text;
  v_barcode text;
  v_packs_per_box integer;
  v_cards_per_pack integer;
  v_weight_grams integer;
  v_active boolean;
  v_imported integer := 0;
begin
  if p_tcgplayer_product_id is null or p_tcgplayer_product_id <= 0 then
    raise exception 'TCGplayer product ID must be positive' using errcode = '22023';
  end if;
  if jsonb_typeof(v_skus) <> 'array' then
    raise exception 'TCGplayer SKUs must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_skus) > 50 then
    raise exception 'A maximum of 50 TCGplayer SKUs can be imported at once' using errcode = '22023';
  end if;

  select * into strict v_product
  from public.admin_create_catalog_product_hierarchy(
    p_category_id,
    p_new_category_slug,
    p_new_category_name,
    p_new_category_publisher,
    p_set_id,
    p_new_set_name,
    p_new_set_code,
    p_new_set_release_date,
    p_new_set_status,
    p_product_type,
    p_new_product_type_name,
    p_new_product_type_code,
    p_name,
    p_description,
    p_language,
    p_image_url,
    p_active,
    p_actor_auth_user_id
  );

  for v_item, v_ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(v_skus) with ordinality as item(value, ordinality)
  loop
    v_sku := upper(trim(coalesce(v_item->>'sku', '')));
    if v_sku !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' then
      raise exception 'Imported SKU code is invalid' using errcode = '22023';
    end if;

    if nullif(v_item->>'sourceSkuId', '') is not null then
      if (v_item->>'sourceSkuId') !~ '^\d+$' then
        raise exception 'TCGplayer SKU ID is invalid' using errcode = '22023';
      end if;
      v_source_sku_id := (v_item->>'sourceSkuId')::bigint;
    else
      v_source_sku_id := null;
    end if;

    if nullif(v_item->>'sourceProductConditionId', '') is not null then
      if (v_item->>'sourceProductConditionId') !~ '^\d+$' then
        raise exception 'TCGplayer product condition ID is invalid' using errcode = '22023';
      end if;
      v_source_condition_id := (v_item->>'sourceProductConditionId')::bigint;
    else
      v_source_condition_id := null;
    end if;

    v_source_language_id := public.tcgplayer_positive_integer(
      v_item->>'sourceLanguageId',
      'TCGplayer language ID'
    );
    v_source_printing_id := public.tcgplayer_positive_integer(
      v_item->>'sourcePrintingId',
      'TCGplayer printing ID'
    );
    v_source_variant_id := public.tcgplayer_positive_integer(
      v_item->>'sourceVariantId',
      'TCGplayer variant ID'
    );

    v_packs_per_box := public.tcgplayer_positive_integer(v_item->>'packsPerBox', 'packs per box');
    v_cards_per_pack := public.tcgplayer_positive_integer(v_item->>'cardsPerPack', 'cards per pack');
    v_weight_grams := public.tcgplayer_positive_integer(v_item->>'weightGrams', 'weight grams');
    v_barcode := nullif(trim(coalesce(v_item->>'barcode', '')), '');
    if v_barcode is not null and char_length(v_barcode) > 64 then
      raise exception 'Imported barcode is too long' using errcode = '22023';
    end if;
    v_active := coalesce((v_item->>'active')::boolean, true);

    v_variant_name := concat(
      'tcgplayer:',
      coalesce(v_source_sku_id::text, concat('variant-', v_ordinal::text))
    );

    insert into public.product_variants (product_id, name, attributes)
    values (
      v_product.product_id,
      v_variant_name,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'tcgplayer',
        'tcgplayerProductId', p_tcgplayer_product_id,
        'tcgplayerSkuId', v_source_sku_id,
        'productConditionId', v_source_condition_id,
        'conditionId', public.tcgplayer_positive_integer(
          v_item->>'sourceConditionId',
          'TCGplayer condition ID'
        ),
        'languageId', v_source_language_id,
        'printingId', v_source_printing_id,
        'variantId', v_source_variant_id,
        'condition', nullif(trim(coalesce(v_item->>'condition', '')), ''),
        'language', nullif(trim(coalesce(v_item->>'language', '')), ''),
        'printing', nullif(trim(coalesce(v_item->>'printing', '')), ''),
        'marketPriceUsd', v_item->'marketPriceUsd',
        'lowPriceUsd', v_item->'lowPriceUsd',
        'midPriceUsd', v_item->'midPriceUsd',
        'highPriceUsd', v_item->'highPriceUsd',
        'directLowPriceUsd', v_item->'directLowPriceUsd'
      ))
    )
    on conflict (product_id, name) do update
      set attributes = excluded.attributes,
          updated_at = now()
    returning id into v_variant_id;

    select sku_row.id, variant.product_id
      into v_existing_sku_id, v_existing_product_id
    from public.booster_box_skus sku_row
    join public.product_variants variant on variant.id = sku_row.product_variant_id
    where sku_row.sku = v_sku;

    if v_existing_sku_id is not null and v_existing_product_id <> v_product.product_id then
      raise exception 'Imported SKU code already belongs to another product' using errcode = '23505';
    end if;

    if v_existing_sku_id is null then
      insert into public.booster_box_skus (
        product_variant_id,
        sku,
        barcode,
        packs_per_box,
        cards_per_pack,
        price_cents,
        currency,
        weight_grams,
        active
      ) values (
        v_variant_id,
        v_sku,
        v_barcode,
        v_packs_per_box,
        v_cards_per_pack,
        0,
        'SGD',
        v_weight_grams,
        v_active
      )
      returning id into v_sku_id;
    else
      update public.booster_box_skus
         set product_variant_id = v_variant_id,
             barcode = v_barcode,
             packs_per_box = v_packs_per_box,
             cards_per_pack = v_cards_per_pack,
             weight_grams = v_weight_grams,
             active = v_active
       where id = v_existing_sku_id
       returning id into v_sku_id;
    end if;

    insert into public.inventory (sku_id, location)
    values (v_sku_id, 'main')
    on conflict on constraint inventory_sku_id_location_key do nothing;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      concat('staff:', p_actor_auth_user_id),
      'booster_box_skus',
      v_sku_id::text,
      'TCGPLAYER_SKU_IMPORT',
      jsonb_build_object(
        'product_id', v_product.product_id,
        'tcgplayer_product_id', p_tcgplayer_product_id,
        'tcgplayer_sku_id', v_source_sku_id,
        'sku', v_sku
      )
    );

    v_imported := v_imported + 1;
  end loop;

  return query select
    v_product.product_id,
    v_product.product_slug,
    v_product.category_id,
    v_product.category_name,
    v_product.category_created,
    v_product.set_id,
    v_product.set_name,
    v_product.set_created,
    v_product.product_type_code,
    v_product.product_type_name,
    v_product.product_type_created,
    v_imported;
end;
$$;

revoke all on function public.tcgplayer_positive_integer(text, text) from public, anon, authenticated;
grant execute on function public.tcgplayer_positive_integer(text, text) to service_role;

revoke all on function public.admin_create_tcgplayer_catalog_product(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, bigint, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.admin_create_tcgplayer_catalog_product(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, bigint, jsonb, uuid
) to service_role;

commit;
