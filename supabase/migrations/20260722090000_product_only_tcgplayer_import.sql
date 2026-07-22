-- Product-only TCGplayer intake. External variant identifiers are metadata, not local entities.

begin;

alter table public.products
  add column reference_code text,
  add column barcode text,
  add column packs_per_box integer,
  add column cards_per_pack integer,
  add column weight_grams integer,
  add column price_cents integer not null default 0,
  add column compare_at_cents integer,
  add column currency text not null default 'SGD',
  add column source_metadata jsonb not null default '{}'::jsonb;

alter table public.products
  add constraint products_reference_code_format
    check (reference_code is null or reference_code ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'),
  add constraint products_barcode_length
    check (barcode is null or char_length(barcode) <= 64),
  add constraint products_physical_values
    check (
      (packs_per_box is null or packs_per_box > 0)
      and (cards_per_pack is null or cards_per_pack > 0)
      and (weight_grams is null or weight_grams > 0)
    ),
  add constraint products_price_values
    check (
      price_cents >= 0
      and (compare_at_cents is null or compare_at_cents >= price_cents)
    ),
  add constraint products_currency_format check (currency ~ '^[A-Z]{3}$');

create unique index products_reference_code_key
  on public.products (reference_code)
  where reference_code is not null;
create unique index products_barcode_key
  on public.products (barcode)
  where barcode is not null;

-- This is an intentional clean break: pre-product-only operational rows are discarded.
truncate table public.limited_time_deals, public.waitlist_entries;

alter table public.limited_time_deals
  drop constraint if exists limited_time_deals_sku_id_fkey;
alter table public.limited_time_deals rename column sku_id to product_id;
alter table public.limited_time_deals
  add constraint limited_time_deals_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_sku_id_fkey,
  drop constraint if exists waitlist_entries_customer_id_sku_id_channel_key;
alter table public.waitlist_entries rename column sku_id to product_id;
alter table public.waitlist_entries
  add constraint waitlist_entries_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade,
  add constraint waitlist_entries_customer_product_channel_key
    unique (customer_id, product_id, channel);

create table public.product_inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  location text not null default 'main',
  on_hand integer not null default 0 check (on_hand >= 0),
  allocated integer not null default 0 check (allocated >= 0),
  incoming integer not null default 0 check (incoming >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  available integer generated always as (on_hand - allocated) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, location),
  constraint product_inventory_no_oversell check (allocated <= on_hand + incoming)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  currency text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  price_cents integer not null check (price_cents > 0),
  compare_at_cents integer,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by_staff_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_prices_compare_at check (
    compare_at_cents is null or compare_at_cents > price_cents
  ),
  constraint product_prices_window check (ends_at is null or ends_at > starts_at)
);
create unique index product_prices_one_current
  on public.product_prices (product_id, currency)
  where active and ends_at is null;

create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('tcgplayer')),
  provider_product_id bigint not null check (provider_product_id > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.catalog_import_products (
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (import_id, product_id),
  unique (import_id, position)
);

alter table public.product_inventory enable row level security;
alter table public.product_prices enable row level security;
alter table public.catalog_imports enable row level security;
alter table public.catalog_import_products enable row level security;
revoke all on table public.product_inventory, public.product_prices,
  public.catalog_imports, public.catalog_import_products
  from public, anon, authenticated;
grant select, insert, update, delete on table public.product_inventory to service_role;
grant select on table public.product_prices to anon, authenticated;
grant select, insert, update, delete on table public.product_prices to service_role;
grant select, insert, update, delete on table public.catalog_imports to service_role;
grant select, insert, update, delete on table public.catalog_import_products to service_role;

create trigger set_updated_at before update on public.product_inventory
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.product_inventory
  for each row execute function public.write_audit_log();
create trigger set_updated_at before update on public.product_prices
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.product_prices
  for each row execute function public.write_audit_log();

create policy "current product prices are readable" on public.product_prices
  for select using (active and starts_at <= now() and (ends_at is null or ends_at > now()));

create or replace function public.admin_import_tcgplayer_products(
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
  p_products jsonb,
  p_actor_auth_user_id uuid
)
returns table (import_id uuid, product_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_hierarchy record;
  v_item jsonb;
  v_position bigint;
  v_product_id uuid;
  v_name text;
  v_reference text;
  v_barcode text;
  v_source_variant_id bigint;
  v_count integer := 0;
begin
  if p_tcgplayer_product_id is null or p_tcgplayer_product_id <= 0 then
    raise exception 'TCGplayer product ID must be positive' using errcode = '22023';
  end if;
  if jsonb_typeof(p_products) <> 'array'
     or jsonb_array_length(p_products) not between 1 and 50 then
    raise exception 'TCGplayer products must contain between 1 and 50 records'
      using errcode = '22023';
  end if;

  v_item := p_products->0;
  v_name := trim(coalesce(v_item->>'name', p_name, ''));

  select * into strict v_hierarchy
  from public.admin_create_catalog_product_hierarchy(
    p_category_id, p_new_category_slug, p_new_category_name, p_new_category_publisher,
    p_set_id, p_new_set_name, p_new_set_code, p_new_set_release_date, p_new_set_status,
    p_product_type, p_new_product_type_name, p_new_product_type_code,
    v_name, p_description, p_language, p_image_url, p_active, p_actor_auth_user_id
  );

  insert into public.catalog_imports (provider, provider_product_id, created_by)
  values ('tcgplayer', p_tcgplayer_product_id, p_actor_auth_user_id)
  returning id into v_import_id;

  for v_item, v_position in
    select item.value, item.ordinality - 1
    from jsonb_array_elements(p_products) with ordinality as item(value, ordinality)
  loop
    v_name := trim(coalesce(v_item->>'name', ''));
    v_reference := upper(trim(coalesce(v_item->>'referenceCode', '')));
    v_barcode := nullif(trim(coalesce(v_item->>'barcode', '')), '');
    v_source_variant_id := nullif(v_item->>'sourceVariantId', '')::bigint;

    if char_length(v_name) not between 2 and 160 then
      raise exception 'product display name must be 2-160 characters' using errcode = '22023';
    end if;
    if v_reference !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' then
      raise exception 'product reference is invalid' using errcode = '22023';
    end if;

    if v_position = 0 then
      v_product_id := v_hierarchy.product_id;
    else
      insert into public.products (
        category_id, set_id, slug, name, product_type, description, language,
        image_url, active
      ) values (
        v_hierarchy.category_id, v_hierarchy.set_id, public.catalog_slug_from_name(v_name),
        v_name, v_hierarchy.product_type_code, nullif(trim(coalesce(p_description, '')), ''),
        upper(trim(coalesce(p_language, 'EN'))), nullif(trim(coalesce(p_image_url, '')), ''),
        coalesce((v_item->>'active')::boolean, p_active, true)
      ) returning id into v_product_id;
    end if;

    update public.products
    set reference_code = v_reference,
        barcode = v_barcode,
        packs_per_box = public.tcgplayer_positive_integer(v_item->>'packsPerBox', 'packs per box'),
        cards_per_pack = public.tcgplayer_positive_integer(v_item->>'cardsPerPack', 'cards per pack'),
        weight_grams = public.tcgplayer_positive_integer(v_item->>'weightGrams', 'weight grams'),
        active = coalesce((v_item->>'active')::boolean, p_active, true),
        source_metadata = jsonb_strip_nulls(jsonb_build_object(
          'provider', 'tcgplayer',
          'productId', p_tcgplayer_product_id,
          'variantId', v_source_variant_id,
          'productConditionId', nullif(v_item->>'sourceProductConditionId', '')::bigint,
          'conditionId', nullif(v_item->>'sourceConditionId', '')::integer,
          'languageId', nullif(v_item->>'sourceLanguageId', '')::integer,
          'printingId', nullif(v_item->>'sourcePrintingId', '')::integer,
          'providerVariantId', nullif(v_item->>'sourceProviderVariantId', '')::integer,
          'condition', nullif(trim(coalesce(v_item->>'condition', '')), ''),
          'language', nullif(trim(coalesce(v_item->>'language', '')), ''),
          'printing', nullif(trim(coalesce(v_item->>'printing', '')), ''),
          'marketPriceUsd', v_item->'marketPriceUsd',
          'lowPriceUsd', v_item->'lowPriceUsd',
          'midPriceUsd', v_item->'midPriceUsd',
          'highPriceUsd', v_item->'highPriceUsd',
          'directLowPriceUsd', v_item->'directLowPriceUsd'
        ))
    where id = v_product_id;

    insert into public.product_inventory (product_id, location)
    values (v_product_id, 'main')
    on conflict (product_id, location) do nothing;

    insert into public.catalog_import_products (import_id, product_id, position)
    values (v_import_id, v_product_id, v_position::integer);

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      concat('staff:', p_actor_auth_user_id), 'products', v_product_id::text,
      'TCGPLAYER_PRODUCT_IMPORT',
      jsonb_build_object(
        'import_id', v_import_id,
        'tcgplayer_product_id', p_tcgplayer_product_id,
        'tcgplayer_variant_id', v_source_variant_id,
        'reference_code', v_reference
      )
    );
    v_count := v_count + 1;
  end loop;

  return query select v_import_id, v_count;
end;
$$;

revoke all on function public.admin_import_tcgplayer_products(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, bigint, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.admin_import_tcgplayer_products(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, bigint, jsonb, uuid
) to service_role;

create or replace function public.admin_update_catalog_product(
  p_product_id uuid,
  p_name text,
  p_category_id uuid,
  p_set_id uuid,
  p_product_type text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_reference_code text,
  p_barcode text,
  p_packs_per_box integer,
  p_cards_per_pack integer,
  p_weight_grams integer,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_role(
    p_actor_auth_user_id,
    array['catalog', 'admin', 'owner']
  ) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  update public.products
  set name = trim(p_name),
      category_id = p_category_id,
      set_id = p_set_id,
      product_type = lower(trim(p_product_type)),
      description = nullif(trim(coalesce(p_description, '')), ''),
      language = upper(trim(coalesce(p_language, 'EN'))),
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      active = coalesce(p_active, true),
      reference_code = upper(trim(p_reference_code)),
      barcode = nullif(trim(coalesce(p_barcode, '')), ''),
      packs_per_box = p_packs_per_box,
      cards_per_pack = p_cards_per_pack,
      weight_grams = p_weight_grams
  where id = p_product_id;

  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'products', p_product_id::text,
    'CONTROL_PRODUCT_UPDATE',
    jsonb_build_object('product_id', p_product_id, 'reference_code', upper(trim(p_reference_code)))
  );
end;
$$;

revoke all on function public.admin_update_catalog_product(
  uuid, text, uuid, uuid, text, text, text, text, boolean,
  text, text, integer, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.admin_update_catalog_product(
  uuid, text, uuid, uuid, text, text, text, text, boolean,
  text, text, integer, integer, integer, uuid
) to service_role;

create or replace function public.admin_set_product_price(
  p_product_id uuid,
  p_currency text,
  p_price_cents integer,
  p_compare_at_cents integer,
  p_actor_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text := upper(trim(coalesce(p_currency, 'SGD')));
  v_price_id uuid;
  v_staff_id uuid;
begin
  if not public.control_actor_has_role(
    p_actor_auth_user_id,
    array['pricing', 'admin', 'owner']
  ) then
    raise exception 'pricing management permission required' using errcode = '42501';
  end if;
  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  if p_compare_at_cents is not null and p_compare_at_cents <= p_price_cents then
    raise exception 'comparison price must be above selling price' using errcode = '22023';
  end if;

  select id into v_staff_id from public.staff_users where auth_user_id = p_actor_auth_user_id;
  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

  update public.product_prices
  set active = false, ends_at = now()
  where product_id = p_product_id and currency = v_currency and active and ends_at is null;

  insert into public.product_prices (
    product_id, currency, price_cents, compare_at_cents, created_by_staff_id
  ) values (
    p_product_id, v_currency, p_price_cents, p_compare_at_cents, v_staff_id
  ) returning id into v_price_id;

  update public.products
  set price_cents = p_price_cents,
      compare_at_cents = p_compare_at_cents,
      currency = v_currency
  where id = p_product_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'product_prices', v_price_id::text,
    'CONTROL_PRODUCT_PRICE_SET',
    jsonb_build_object('product_id', p_product_id, 'currency', v_currency)
  );
  return v_price_id;
end;
$$;

revoke all on function public.admin_set_product_price(uuid, text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_product_price(uuid, text, integer, integer, uuid)
  to service_role;

create or replace function public.admin_upsert_product_promotion(
  p_deal_id uuid,
  p_code text,
  p_product_id uuid,
  p_title text,
  p_description text,
  p_deal_price_cents integer,
  p_visibility text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_sort_priority integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deal_id uuid;
  v_original_price integer;
  v_discount_bps integer;
begin
  if not public.control_actor_has_role(
    p_actor_auth_user_id,
    array['pricing', 'admin', 'owner']
  ) then
    raise exception 'pricing management permission required' using errcode = '42501';
  end if;

  select price_cents into v_original_price from public.products where id = p_product_id;
  if v_original_price is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if p_deal_price_cents <= 0 or p_deal_price_cents >= v_original_price then
    raise exception 'deal price must be positive and below the product price' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'deal end must be after its start' using errcode = '22023';
  end if;
  v_discount_bps := round(((v_original_price - p_deal_price_cents)::numeric * 10000) / v_original_price);

  insert into public.limited_time_deals as deal (
    id, code, product_id, title, description, discount_bps, deal_price_cents,
    visibility, starts_at, ends_at, sort_priority, active
  ) values (
    coalesce(p_deal_id, gen_random_uuid()), lower(trim(p_code)), p_product_id,
    trim(p_title), nullif(trim(coalesce(p_description, '')), ''), v_discount_bps,
    p_deal_price_cents, p_visibility, p_starts_at, p_ends_at,
    coalesce(p_sort_priority, 0), coalesce(p_active, false)
  )
  on conflict (id) do update
  set code = excluded.code,
      product_id = excluded.product_id,
      title = excluded.title,
      description = excluded.description,
      discount_bps = excluded.discount_bps,
      deal_price_cents = excluded.deal_price_cents,
      visibility = excluded.visibility,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      sort_priority = excluded.sort_priority,
      active = excluded.active
  returning deal.id into v_deal_id;

  return v_deal_id;
end;
$$;

revoke all on function public.admin_upsert_product_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz, timestamptz, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_product_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz, timestamptz, integer, boolean, uuid
) to service_role;

commit;
