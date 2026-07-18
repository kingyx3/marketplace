-- Canonical managed product types and database-derived product identity.
-- This project is pre-production: invalid historical catalog rows are rejected instead of migrated.

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_types_code_format check (code ~ '^[a-z][a-z0-9_]{0,63}$')
);

create unique index product_types_name_ci_key
  on public.product_types (lower(name));

alter table public.product_types enable row level security;
revoke all on table public.product_types from public, anon, authenticated;
grant select, insert, update, delete on table public.product_types to service_role;

insert into public.product_types (code, name, sort_order)
values
  ('booster_box', 'Booster box', 10),
  ('collector_box', 'Collector box', 20),
  ('bundle', 'Bundle', 30),
  ('case', 'Case', 40),
  ('other', 'Other', 100);

-- Products always belong to a real set and a managed product type.
-- Existing development data that violates these canonical constraints must be reset or corrected.
alter table public.products alter column set_id set not null;
alter table public.products
  add constraint products_product_type_fkey
  foreign key (product_type) references public.product_types(code);

create function public.set_catalog_product_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category_slug text;
  v_set_name text;
  v_set_code text;
  v_product_type_name text;
  v_language text := upper(trim(coalesce(new.language, 'EN')));
  v_set_segment text;
  v_type_segment text;
begin
  if v_language !~ '^[A-Z]{2,8}$' then
    raise exception 'language code is invalid' using errcode = '22023';
  end if;

  new.product_type := lower(trim(coalesce(new.product_type, '')));

  select category.slug, release.name, release.code, product_type.name
    into v_category_slug, v_set_name, v_set_code, v_product_type_name
  from public.tcg_categories category
  join public.sets_releases release
    on release.id = new.set_id
   and release.category_id = category.id
  join public.product_types product_type
    on product_type.code = new.product_type
  where category.id = new.category_id;

  if not found then
    raise exception 'category, set, or product type relationship is invalid' using errcode = 'P0002';
  end if;

  v_set_segment := trim(both '-' from regexp_replace(lower(v_set_code), '[^a-z0-9]+', '-', 'g'));
  v_type_segment := trim(both '-' from regexp_replace(new.product_type, '[^a-z0-9]+', '-', 'g'));

  if v_set_segment = '' or v_type_segment = '' then
    raise exception 'set code and product type must generate valid slug segments' using errcode = '22023';
  end if;

  new.language := v_language;
  new.slug := concat_ws('-', v_category_slug, v_set_segment, v_type_segment, lower(v_language));
  new.name := concat(v_set_name, ' ', v_product_type_name, ' (', v_language, ')');
  return new;
end;
$$;

revoke all on function public.set_catalog_product_identity() from public, anon, authenticated;

create trigger set_catalog_product_identity
before insert or update on public.products
for each row execute function public.set_catalog_product_identity();

-- Normalize any valid development rows to the canonical generated identity.
update public.products set updated_at = now();

create function public.refresh_catalog_product_identity_from_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'tcg_categories' then
    update public.products set updated_at = now() where category_id = new.id;
  elsif tg_table_name = 'sets_releases' then
    update public.products set updated_at = now() where set_id = new.id;
  elsif tg_table_name = 'product_types' then
    update public.products set updated_at = now() where product_type = new.code;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_catalog_product_identity_from_parent()
  from public, anon, authenticated;

create trigger refresh_product_identity_from_category
after update of name, slug on public.tcg_categories
for each row
when (old.name is distinct from new.name or old.slug is distinct from new.slug)
execute function public.refresh_catalog_product_identity_from_parent();

create trigger refresh_product_identity_from_set
after update of name, code on public.sets_releases
for each row
when (old.name is distinct from new.name or old.code is distinct from new.code)
execute function public.refresh_catalog_product_identity_from_parent();

create trigger refresh_product_identity_from_type
after update of name on public.product_types
for each row
when (old.name is distinct from new.name)
execute function public.refresh_catalog_product_identity_from_parent();

create trigger set_updated_at
before update on public.product_types
for each row execute function public.set_updated_at();

-- Remove the superseded product-creation contract before defining the canonical one.
drop function public.admin_create_catalog_product_hierarchy(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, boolean, uuid
);

create function public.admin_create_catalog_product_hierarchy(
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
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
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
  v_product_type_code text := lower(trim(coalesce(p_product_type, '')));
  v_new_product_type_name text := trim(coalesce(p_new_product_type_name, ''));
  v_new_product_type_code text := lower(trim(coalesce(p_new_product_type_code, '')));
  v_product_type_name text;
  v_product_type_active boolean;
  v_product_type_created boolean := false;
  v_language text := upper(trim(coalesce(p_language, 'EN')));
  v_product_id uuid;
  v_product_slug text;
begin
  if not public.control_actor_has_role(
    p_actor_auth_user_id,
    array['catalog', 'admin', 'owner']
  ) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if v_language !~ '^[A-Z]{2,8}$' then
    raise exception 'language code is invalid' using errcode = '22023';
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
  else
    if v_new_set_name = '' then
      raise exception 'set required' using errcode = '22023';
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

  if v_product_type_code <> '' and (v_new_product_type_name <> '' or v_new_product_type_code <> '') then
    raise exception 'select an existing product type or add a new product type, not both'
      using errcode = '22023';
  end if;

  if v_product_type_code <> '' then
    select product_type.name, product_type.active
      into v_product_type_name, v_product_type_active
    from public.product_types product_type
    where product_type.code = v_product_type_code;

    if v_product_type_name is null then
      raise exception 'product type not found' using errcode = 'P0002';
    end if;
    if not v_product_type_active then
      raise exception 'archived product type must be restored first' using errcode = '23505';
    end if;
  else
    if v_new_product_type_name = '' then
      raise exception 'product type required' using errcode = '22023';
    end if;
    if v_new_product_type_code !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'product type code is invalid' using errcode = '22023';
    end if;

    select product_type.code, product_type.name, product_type.active
      into v_product_type_code, v_product_type_name, v_product_type_active
    from public.product_types product_type
    where product_type.code = v_new_product_type_code
       or lower(product_type.name) = lower(v_new_product_type_name)
    order by case when product_type.code = v_new_product_type_code then 0 else 1 end
    limit 1;

    if v_product_type_name is not null then
      if not v_product_type_active then
        raise exception 'archived product type must be restored first' using errcode = '23505';
      end if;
    else
      insert into public.product_types (code, name, active, sort_order)
      values (v_new_product_type_code, v_new_product_type_name, true, 0)
      returning code, name into v_product_type_code, v_product_type_name;
      v_product_type_created := true;

      insert into public.audit_logs (actor, table_name, record_id, action, new_data)
      select
        concat('staff:', p_actor_auth_user_id),
        'product_types',
        product_type.id::text,
        'CONTROL_PRODUCT_TYPE_CREATE_INLINE',
        jsonb_build_object('code', product_type.code, 'name', product_type.name)
      from public.product_types product_type
      where product_type.code = v_product_type_code;
    end if;
  end if;

  if exists (
    select 1
    from public.products product
    where product.category_id = v_category_id
      and product.set_id = v_set_id
      and product.product_type = v_product_type_code
      and product.language = v_language
  ) then
    raise exception 'product already exists for this category, set, type, and language'
      using errcode = '23505';
  end if;

  insert into public.products (
    category_id,
    set_id,
    product_type,
    description,
    language,
    image_url,
    active
  ) values (
    v_category_id,
    v_set_id,
    v_product_type_code,
    nullif(trim(coalesce(p_description, '')), ''),
    v_language,
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_active, true)
  )
  returning id, slug into v_product_id, v_product_slug;

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
      'product_type', v_product_type_code,
      'product_type_created', v_product_type_created,
      'language', v_language,
      'active', coalesce(p_active, true)
    )
  );

  return query
  select
    v_product_id,
    v_product_slug,
    v_category_id,
    v_category_name,
    v_category_created,
    v_set_id,
    v_set_name,
    v_set_created,
    v_product_type_code,
    v_product_type_name,
    v_product_type_created;
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

-- Remove the obsolete manual-name/manual-slug upsert contract.
drop function public.admin_upsert_catalog_product(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text
);

create function public.admin_upsert_catalog_product(
  p_product_id uuid,
  p_category_id uuid,
  p_set_id uuid,
  p_product_type text,
  p_description text,
  p_language text,
  p_image_url text,
  p_active boolean,
  p_actor text
)
returns table (product_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_type text := lower(trim(coalesce(p_product_type, '')));
  v_language text := upper(trim(coalesce(p_language, 'EN')));
  v_product_id uuid;
  v_product_slug text;
  v_action text;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_language !~ '^[A-Z]{2,8}$' then
    raise exception 'language code is invalid' using errcode = '22023';
  end if;

  perform 1 from public.tcg_categories where id = p_category_id and active;
  if not found then
    raise exception 'active category not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.sets_releases
  where id = p_set_id
    and category_id = p_category_id
    and active;
  if not found then
    raise exception 'active set not found for category' using errcode = 'P0002';
  end if;

  perform 1 from public.product_types where code = v_product_type and active;
  if not found then
    raise exception 'active product type not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.products product
    where product.category_id = p_category_id
      and product.set_id = p_set_id
      and product.product_type = v_product_type
      and product.language = v_language
      and product.id is distinct from p_product_id
  ) then
    raise exception 'product already exists for this category, set, type, and language'
      using errcode = '23505';
  end if;

  if p_product_id is null then
    insert into public.products (
      category_id,
      set_id,
      product_type,
      description,
      language,
      image_url,
      active
    ) values (
      p_category_id,
      p_set_id,
      v_product_type,
      nullif(trim(coalesce(p_description, '')), ''),
      v_language,
      nullif(trim(coalesce(p_image_url, '')), ''),
      coalesce(p_active, true)
    )
    returning id, slug into v_product_id, v_product_slug;
    v_action := 'ADMIN_PRODUCT_CREATE';
  else
    update public.products
       set category_id = p_category_id,
           set_id = p_set_id,
           product_type = v_product_type,
           description = nullif(trim(coalesce(p_description, '')), ''),
           language = v_language,
           image_url = nullif(trim(coalesce(p_image_url, '')), ''),
           active = coalesce(p_active, true)
     where id = p_product_id
     returning id, slug into v_product_id, v_product_slug;

    if v_product_id is null then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
    v_action := 'ADMIN_PRODUCT_UPDATE';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'products',
    v_product_id::text,
    v_action,
    jsonb_build_object(
      'product_id', v_product_id,
      'slug', v_product_slug,
      'category_id', p_category_id,
      'set_id', p_set_id,
      'product_type', v_product_type,
      'language', v_language,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_product_id;
end;
$$;

revoke all on function public.admin_upsert_catalog_product(
  uuid, uuid, uuid, text, text, text, text, boolean, text
) from public, anon, authenticated;

grant execute on function public.admin_upsert_catalog_product(
  uuid, uuid, uuid, text, text, text, text, boolean, text
) to service_role;
