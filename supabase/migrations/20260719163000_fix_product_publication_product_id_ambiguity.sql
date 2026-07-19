-- Fix PL/pgSQL ambiguity between the table-returning RPC output column named
-- product_id and the listing_items.product_id conflict target.
--
-- Using the named unique constraint makes the conflict target unambiguous for
-- both product creation and product editing while preserving atomic publication.

begin;

create or replace function public.admin_create_catalog_product_with_publication(
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
  on conflict on constraint listing_items_product_id_key do update
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

create or replace function public.admin_upsert_catalog_product_with_publication(
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
  on conflict on constraint listing_items_product_id_key do update
    set published = excluded.published;

  return query select v_product_id;
end;
$$;

commit;
