-- Make product publication saves unambiguous even when PostgreSQL resolves
-- table-returning output columns as PL/pgSQL variables.
--
-- The previous function returned table (product_id uuid). That output column became
-- an implicit PL/pgSQL variable named product_id and previously conflicted with
-- listing_items.product_id. Return a scalar UUID instead; the application only
-- needs the mutation result and does not depend on a table-shaped payload.

begin;

drop function if exists public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
);

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
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saved_product_id uuid;
  v_published boolean := coalesce(p_published, true);
begin
  select saved.product_id
    into v_saved_product_id
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
  ) as saved;

  if v_saved_product_id is null then
    raise exception 'product save did not return a product id' using errcode = 'P0002';
  end if;

  insert into public.listing_items as listing (product_id, published)
  values (v_saved_product_id, v_published)
  on conflict on constraint listing_items_product_id_key do update
    set published = excluded.published;

  return v_saved_product_id;
end;
$$;

revoke all on function public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
) from public, anon, authenticated;

grant execute on function public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
) to service_role;

commit;
