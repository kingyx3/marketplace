-- Collapse duplicate pre-production products before canonical identity is enforced.
-- The runtime schema remains strict; this is a one-time migration for development data.

begin;

create temporary table canonical_product_duplicates on commit drop as
with ranked_products as (
  select
    product.id as product_id,
    first_value(product.id) over identity_partition as survivor_product_id
  from public.products product
  left join public.listing_items listing
    on listing.product_id = product.id
  where product.set_id is not null
  window identity_partition as (
    partition by
      product.category_id,
      product.set_id,
      lower(trim(product.product_type)),
      upper(trim(coalesce(product.language, 'EN')))
    order by
      coalesce(listing.published, false) desc,
      coalesce(listing.featured, false) desc,
      product.active desc,
      (
        (product.image_url is not null)::integer
        + (product.description is not null)::integer
      ) desc,
      product.created_at,
      product.id
  )
)
select
  product_id as duplicate_product_id,
  survivor_product_id
from ranked_products
where product_id <> survivor_product_id;

create unique index canonical_product_duplicates_product_key
  on canonical_product_duplicates (duplicate_product_id);

create index canonical_product_duplicates_survivor_idx
  on canonical_product_duplicates (survivor_product_id);

do $$
declare
  duplicate_record record;
  duplicate_variant record;
  survivor_variant_id uuid;
begin
  for duplicate_record in
    select
      duplicate_map.duplicate_product_id,
      duplicate_map.survivor_product_id
    from canonical_product_duplicates duplicate_map
    join public.products duplicate_product
      on duplicate_product.id = duplicate_map.duplicate_product_id
    order by duplicate_product.created_at, duplicate_product.id
  loop
    -- Retain the best available product metadata and active state.
    update public.products survivor
    set description = coalesce(survivor.description, duplicate_product.description),
        image_url = coalesce(survivor.image_url, duplicate_product.image_url),
        active = survivor.active or duplicate_product.active,
        updated_at = now()
    from public.products duplicate_product
    where survivor.id = duplicate_record.survivor_product_id
      and duplicate_product.id = duplicate_record.duplicate_product_id;

    -- Merge the duplicate listing into the canonical product before removing it.
    insert into public.listing_items as current_listing (
      product_id,
      title_override,
      badge_label,
      tags,
      channels,
      max_per_customer,
      preorder_reserve,
      sort_priority,
      featured,
      published
    )
    select
      duplicate_record.survivor_product_id,
      duplicate_listing.title_override,
      duplicate_listing.badge_label,
      duplicate_listing.tags,
      duplicate_listing.channels,
      duplicate_listing.max_per_customer,
      duplicate_listing.preorder_reserve,
      duplicate_listing.sort_priority,
      duplicate_listing.featured,
      duplicate_listing.published
    from public.listing_items duplicate_listing
    where duplicate_listing.product_id = duplicate_record.duplicate_product_id
    on conflict (product_id) do update
    set title_override = coalesce(current_listing.title_override, excluded.title_override),
        badge_label = coalesce(current_listing.badge_label, excluded.badge_label),
        tags = (
          select coalesce(array_agg(distinct merged_tag order by merged_tag), '{}'::text[])
          from unnest(
            coalesce(current_listing.tags, '{}'::text[])
            || coalesce(excluded.tags, '{}'::text[])
          ) as merged_tags(merged_tag)
          where trim(merged_tag) <> ''
        ),
        channels = (
          select coalesce(array_agg(distinct merged_channel order by merged_channel), array['b2c']::text[])
          from unnest(
            coalesce(current_listing.channels, array['b2c']::text[])
            || coalesce(excluded.channels, array['b2c']::text[])
          ) as merged_channels(merged_channel)
          where trim(merged_channel) <> ''
        ),
        max_per_customer = coalesce(
          current_listing.max_per_customer,
          excluded.max_per_customer
        ),
        preorder_reserve = greatest(
          current_listing.preorder_reserve,
          excluded.preorder_reserve
        ),
        sort_priority = least(
          current_listing.sort_priority,
          excluded.sort_priority
        ),
        featured = current_listing.featured or excluded.featured,
        published = current_listing.published or excluded.published,
        updated_at = now();

    delete from public.listing_items
    where product_id = duplicate_record.duplicate_product_id;

    -- Preserve every SKU and its inventory/order/deal references while merging variants.
    for duplicate_variant in
      select variant.id, variant.name
      from public.product_variants variant
      where variant.product_id = duplicate_record.duplicate_product_id
      order by variant.created_at, variant.id
    loop
      select variant.id
      into survivor_variant_id
      from public.product_variants variant
      where variant.product_id = duplicate_record.survivor_product_id
        and variant.name = duplicate_variant.name;

      if survivor_variant_id is null then
        update public.product_variants
        set product_id = duplicate_record.survivor_product_id,
            updated_at = now()
        where id = duplicate_variant.id;
      else
        update public.booster_box_skus
        set product_variant_id = survivor_variant_id,
            updated_at = now()
        where product_variant_id = duplicate_variant.id;

        delete from public.product_variants
        where id = duplicate_variant.id;
      end if;
    end loop;

    insert into public.audit_logs (
      actor,
      table_name,
      record_id,
      action,
      old_data,
      new_data
    ) values (
      'migration:canonical-product-identity',
      'products',
      duplicate_record.duplicate_product_id::text,
      'CATALOG_PRODUCT_DUPLICATE_COLLAPSE',
      jsonb_build_object('duplicate_product_id', duplicate_record.duplicate_product_id),
      jsonb_build_object('survivor_product_id', duplicate_record.survivor_product_id)
    );

    delete from public.products
    where id = duplicate_record.duplicate_product_id;
  end loop;
end;
$$;

commit;
