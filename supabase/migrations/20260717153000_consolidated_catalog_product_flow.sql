-- Atomic catalog intake used by the consolidated admin product flow.
-- A missing category can be created in the same transaction as the product.

create or replace function public.admin_create_catalog_product_with_category(
  p_category_id uuid,
  p_new_category_slug text,
  p_new_category_name text,
  p_new_category_publisher text,
  p_set_id uuid,
  p_slug text,
  p_name text,
  p_product_type text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (
  product_id uuid,
  category_id uuid,
  category_name text,
  category_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid := p_category_id;
  v_category_name text;
  v_category_created boolean := false;
  v_category_slug text := lower(trim(coalesce(p_new_category_slug, '')));
  v_new_category_name text := trim(coalesce(p_new_category_name, ''));
  v_product_slug text := lower(trim(coalesce(p_slug, '')));
  v_product_name text := trim(coalesce(p_name, ''));
  v_product_type text := lower(trim(coalesce(p_product_type, '')));
  v_language text := upper(trim(coalesce(p_language, 'EN')));
  v_product_id uuid;
begin
  if not public.control_actor_has_role(
    p_actor_auth_user_id,
    array['catalog', 'admin', 'owner']
  ) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if v_product_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'product slug must be lowercase words separated by hyphens' using errcode = '22023';
  end if;
  if v_product_name = '' then
    raise exception 'product name required' using errcode = '22023';
  end if;
  if v_product_type !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'product type is invalid' using errcode = '22023';
  end if;
  if v_language !~ '^[A-Z]{2,8}$' then
    raise exception 'language code is invalid' using errcode = '22023';
  end if;

  if exists (select 1 from public.products where slug = v_product_slug) then
    raise exception 'product slug already exists' using errcode = '23505';
  end if;

  if v_category_id is null then
    if v_category_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'category slug must be lowercase words separated by hyphens' using errcode = '22023';
    end if;
    if v_new_category_name = '' then
      raise exception 'category name required' using errcode = '22023';
    end if;

    select id, name
      into v_category_id, v_category_name
    from public.tcg_categories
    where slug = v_category_slug
      and active;

    if v_category_id is null then
      if exists (select 1 from public.tcg_categories where slug = v_category_slug and not active) then
        raise exception 'category slug belongs to an archived category; restore it first'
          using errcode = '23505';
      end if;

      insert into public.tcg_categories (
        slug,
        name,
        publisher,
        active,
        sort_order
      ) values (
        v_category_slug,
        v_new_category_name,
        nullif(trim(coalesce(p_new_category_publisher, '')), ''),
        true,
        0
      )
      returning id, name into v_category_id, v_category_name;
      v_category_created := true;

      insert into public.audit_logs (actor, table_name, record_id, action, new_data)
      values (
        concat('staff:', p_actor_auth_user_id),
        'tcg_categories',
        v_category_id::text,
        'CONTROL_CATEGORY_CREATE_INLINE',
        jsonb_build_object('slug', v_category_slug, 'name', v_category_name)
      );
    end if;
  else
    select name into v_category_name
    from public.tcg_categories
    where id = v_category_id
      and active;
    if v_category_name is null then
      raise exception 'active category not found' using errcode = 'P0002';
    end if;
  end if;

  if p_set_id is not null then
    perform 1
    from public.sets_releases
    where id = p_set_id
      and category_id = v_category_id
      and active;
    if not found then
      raise exception 'active set not found for category' using errcode = 'P0002';
    end if;
  end if;

  insert into public.products (
    category_id,
    set_id,
    slug,
    name,
    product_type,
    description,
    language,
    image_url,
    active
  ) values (
    v_category_id,
    p_set_id,
    v_product_slug,
    v_product_name,
    v_product_type,
    nullif(trim(coalesce(p_description, '')), ''),
    v_language,
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_active, true)
  )
  returning id into v_product_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'products',
    v_product_id::text,
    'CONTROL_PRODUCT_CREATE',
    jsonb_build_object(
      'slug', v_product_slug,
      'category_id', v_category_id,
      'category_created', v_category_created,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_product_id, v_category_id, v_category_name, v_category_created;
end;
$$;

revoke all on function public.admin_create_catalog_product_with_category(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.admin_create_catalog_product_with_category(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, uuid
) to service_role;
