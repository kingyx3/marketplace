-- Product publication is managed with the product itself.
-- Published is the default editorial intent, while the storefront product policy still
-- requires an active SKU with a positive price before a product can be read publicly.

begin;

-- Publication is independent from SKU readiness. A published product without a sellable
-- SKU remains invisible through the catalog-readable product policy and becomes visible
-- automatically when an active positively priced SKU is added.
drop trigger if exists enforce_listing_sellable_sku on public.listing_items;
drop function if exists public.enforce_listing_sellable_sku();

drop trigger if exists unpublish_listing_without_sellable_sku on public.booster_box_skus;
drop function if exists public.unpublish_listing_without_sellable_sku();

alter table public.listing_items
  alter column published set default true;

create or replace function public.create_default_listing_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_items (product_id, published)
  values (new.id, true)
  on conflict (product_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_default_listing_item() from public, anon, authenticated;
grant execute on function public.create_default_listing_item() to service_role;

create function public.admin_create_catalog_product_with_publication(
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
  p_published boolean,
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
  product_type_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created record;
  v_published boolean := coalesce(p_published, true);
begin
  select created.*
    into v_created
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
  ) created;

  insert into public.listing_items (product_id, published)
  values (v_created.product_id, v_published)
  on conflict (product_id) do update
    set published = excluded.published;

  return query
  select
    v_created.product_id::uuid,
    v_created.product_slug::text,
    v_created.category_id::uuid,
    v_created.category_name::text,
    v_created.category_created::boolean,
    v_created.set_id::uuid,
    v_created.set_name::text,
    v_created.set_created::boolean,
    v_created.product_type_code::text,
    v_created.product_type_name::text,
    v_created.product_type_created::boolean;
end;
$$;

revoke all on function public.admin_create_catalog_product_with_publication(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.admin_create_catalog_product_with_publication(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, boolean, uuid
) to service_role;

create function public.admin_upsert_catalog_product_with_publication(
  p_product_id uuid,
  p_name text,
  p_category_id uuid,
  p_set_id uuid,
  p_product_type text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_published boolean,
  p_actor text
)
returns table (product_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_published boolean := coalesce(p_published, true);
begin
  select saved.product_id
    into v_product_id
  from public.admin_upsert_catalog_product(
    p_product_id,
    p_name,
    p_category_id,
    p_set_id,
    p_product_type,
    p_description,
    p_language,
    p_image_url,
    p_active,
    p_actor
  ) saved;

  insert into public.listing_items (product_id, published)
  values (v_product_id, v_published)
  on conflict (product_id) do update
    set published = excluded.published;

  return query select v_product_id;
end;
$$;

revoke all on function public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
) from public, anon, authenticated;

grant execute on function public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
) to service_role;

commit;
