-- Prevent the admin SKU RPC output column from colliding with inventory.sku_id.
-- PL/pgSQL exposes RETURNS TABLE columns as variables, so an unqualified
-- ON CONFLICT (sku_id, location) target is ambiguous at runtime.

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
  on conflict on constraint inventory_sku_id_location_key do nothing;

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
