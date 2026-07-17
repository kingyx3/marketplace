-- Atomic hierarchical catalog intake for category -> set -> product creation.
-- Existing records may be selected, while missing categories and sets can be
-- created in the same transaction without losing product form state.

create or replace function public.admin_create_catalog_product_hierarchy(
  p_category_id uuid,
  p_new_category_slug text,
  p_new_category_name text,
  p_new_category_publisher text,
  p_set_id uuid,
  p_new_set_name text,
  p_new_set_code text,
  p_new_set_release_date date,
  p_new_set_status public.set_status,
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
  category_created boolean,
  set_id uuid,
  set_name text,
  set_created boolean
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
  v_set_id uuid := p_set_id;
  v_set_name text;
  v_set_created boolean := false;
  v_new_set_name text := trim(coalesce(p_new_set_name, ''));
  v_new_set_code text := upper(trim(coalesce(p_new_set_code, '')));
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

    select category.id, category.name
      into v_category_id, v_category_name
    from public.tcg_categories category
    where category.slug = v_category_slug
      and category.active;

    if v_category_id is null then
      if exists (
        select 1
        from public.tcg_categories category
        where category.slug = v_category_slug
          and not category.active
      ) then
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
    select category.name
      into v_category_name
    from public.tcg_categories category
    where category.id = v_category_id
      and category.active;

    if v_category_name is null then
      raise exception 'active category not found' using errcode = 'P0002';
    end if;
  end if;

  if v_set_id is not null and (v_new_set_name <> '' or v_new_set_code <> '') then
    raise exception 'select an existing set or add a new set, not both' using errcode = '22023';
  end if;

  if v_set_id is not null then
    select release.name
      into v_set_name
    from public.sets_releases release
    where release.id = v_set_id
      and release.category_id = v_category_id
      and release.active;

    if v_set_name is null then
      raise exception 'active set not found for category' using errcode = 'P0002';
    end if;
  elsif v_new_set_name <> '' or v_new_set_code <> '' then
    if v_new_set_name = '' then
      raise exception 'set name required' using errcode = '22023';
    end if;
    if v_new_set_code !~ '^[A-Z0-9][A-Z0-9_-]{1,15}$' then
      raise exception 'set code is invalid' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.sets_releases release
      where release.category_id = v_category_id
        and release.code = v_new_set_code
        and release.active
    ) then
      raise exception 'set code already exists for category; select existing set'
        using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.sets_releases release
      where release.category_id = v_category_id
        and release.code = v_new_set_code
        and not release.active
    ) then
      raise exception 'set code belongs to an archived set; restore it first'
        using errcode = '23505';
    end if;

    insert into public.sets_releases (
      category_id,
      name,
      code,
      release_date,
      status,
      active,
      sort_order
    ) values (
      v_category_id,
      v_new_set_name,
      v_new_set_code,
      p_new_set_release_date,
      coalesce(p_new_set_status, 'announced'::public.set_status),
      true,
      0
    )
    returning id, name into v_set_id, v_set_name;
    v_set_created := true;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      concat('staff:', p_actor_auth_user_id),
      'sets_releases',
      v_set_id::text,
      'CONTROL_SET_CREATE_INLINE',
      jsonb_build_object(
        'code', v_new_set_code,
        'name', v_set_name,
        'category_id', v_category_id
      )
    );
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
    v_set_id,
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
      'set_id', v_set_id,
      'set_created', v_set_created,
      'active', coalesce(p_active, true)
    )
  );

  return query
  select
    v_product_id,
    v_category_id,
    v_category_name,
    v_category_created,
    v_set_id,
    v_set_name,
    v_set_created;
end;
$$;

revoke all on function public.admin_create_catalog_product_hierarchy(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.admin_create_catalog_product_hierarchy(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, boolean, uuid
) to service_role;
