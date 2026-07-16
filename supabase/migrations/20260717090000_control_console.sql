-- Dedicated operations console primitives.
-- Adds delegated administrator access, catalog hierarchy controls, supplier
-- lifecycle state, and audited service-role RPCs used by /control.

alter table public.staff_users
  drop constraint if exists staff_users_role_check;

alter table public.staff_users
  add constraint staff_users_role_check
  check (role in ('viewer', 'support', 'catalog', 'operations', 'admin', 'owner'));

alter table public.staff_users
  add column if not exists email text,
  add column if not exists source text not null default 'database'
    check (source in ('database', 'environment')),
  add column if not exists created_by_staff_id uuid references public.staff_users(id) on delete set null,
  add column if not exists last_seen_at timestamptz;

create unique index if not exists staff_users_normalized_email_key
  on public.staff_users (lower(email))
  where email is not null;

create table if not exists public.admin_access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'viewer'
    check (role in ('viewer', 'support', 'catalog', 'operations', 'admin', 'owner')),
  active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_by_staff_id uuid references public.staff_users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_access_grants_email_normalized
    check (email = lower(trim(email))),
  constraint admin_access_grants_email_format
    check (email ~ '^[^,[:space:]@]+@[^,[:space:]@]+\.[^,[:space:]@]+$'),
  unique (email)
);

alter table public.admin_access_grants enable row level security;

revoke all on table public.admin_access_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_access_grants to service_role;

drop trigger if exists set_updated_at on public.admin_access_grants;
create trigger set_updated_at before update on public.admin_access_grants
  for each row execute function public.set_updated_at();

drop trigger if exists audit_log on public.admin_access_grants;
create trigger audit_log after insert or update or delete on public.admin_access_grants
  for each row execute function public.write_audit_log();

alter table public.suppliers
  add column if not exists active boolean not null default true;

alter table public.tcg_categories
  add column if not exists parent_id uuid references public.tcg_categories(id) on delete restrict,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0
    check (sort_order >= 0),
  add constraint tcg_categories_not_self_parent
    check (parent_id is null or parent_id <> id);

alter table public.sets_releases
  add column if not exists description text,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0
    check (sort_order >= 0);

create index if not exists tcg_categories_parent_sort_idx
  on public.tcg_categories (parent_id, sort_order, name);
create index if not exists sets_releases_category_sort_idx
  on public.sets_releases (category_id, sort_order, release_date desc nulls last);
create index if not exists suppliers_active_name_idx
  on public.suppliers (active, name);
create index if not exists admin_access_grants_active_role_idx
  on public.admin_access_grants (active, role, email);

create or replace function public.prevent_tcg_category_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'category cannot be its own parent' using errcode = '23514';
  end if;

  if exists (
    with recursive ancestry as (
      select id, parent_id
      from public.tcg_categories
      where id = new.parent_id

      union all

      select category.id, category.parent_id
      from public.tcg_categories category
      join ancestry on category.id = ancestry.parent_id
    )
    select 1 from ancestry where id = new.id
  ) then
    raise exception 'category hierarchy cycle detected' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_tcg_category_cycle on public.tcg_categories;
create trigger prevent_tcg_category_cycle
  before insert or update of parent_id on public.tcg_categories
  for each row execute function public.prevent_tcg_category_cycle();

drop trigger if exists audit_log on public.suppliers;
create trigger audit_log after insert or update or delete on public.suppliers
  for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.tcg_categories;
create trigger audit_log after insert or update or delete on public.tcg_categories
  for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.sets_releases;
create trigger audit_log after insert or update or delete on public.sets_releases
  for each row execute function public.write_audit_log();

create or replace function public.control_actor_has_role(
  p_actor_auth_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = p_actor_auth_user_id
      and staff.active
      and staff.role = any(p_roles)
  );
$$;

revoke all on function public.control_actor_has_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.control_actor_has_role(uuid, text[]) to service_role;

create or replace function public.admin_upsert_supplier(
  p_supplier_id uuid,
  p_name text,
  p_supplier_type text,
  p_region text,
  p_contact jsonb,
  p_payment_terms text,
  p_min_order_cents integer,
  p_currency text,
  p_notes text,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (supplier_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_supplier_type text := lower(trim(coalesce(p_supplier_type, 'distributor')));
  v_currency text := upper(trim(coalesce(p_currency, 'SGD')));
  v_action text;
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['operations', 'admin', 'owner']) then
    raise exception 'supplier management permission required' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'supplier name required' using errcode = '22023';
  end if;

  if v_supplier_type not in ('distributor', 'publisher_direct', 'peer_retailer', 'other') then
    raise exception 'invalid supplier type' using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a three-letter code' using errcode = '22023';
  end if;

  if p_min_order_cents is not null and p_min_order_cents < 0 then
    raise exception 'minimum order cannot be negative' using errcode = '22023';
  end if;

  if p_supplier_id is null then
    insert into public.suppliers (
      name, supplier_type, region, contact, payment_terms,
      min_order_cents, currency, notes, active
    ) values (
      v_name,
      v_supplier_type,
      nullif(trim(coalesce(p_region, '')), ''),
      coalesce(p_contact, '{}'::jsonb),
      nullif(trim(coalesce(p_payment_terms, '')), ''),
      p_min_order_cents,
      v_currency,
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_active, true)
    ) returning id into v_supplier_id;
    v_action := 'CONTROL_SUPPLIER_CREATE';
  else
    update public.suppliers
       set name = v_name,
           supplier_type = v_supplier_type,
           region = nullif(trim(coalesce(p_region, '')), ''),
           contact = coalesce(p_contact, '{}'::jsonb),
           payment_terms = nullif(trim(coalesce(p_payment_terms, '')), ''),
           min_order_cents = p_min_order_cents,
           currency = v_currency,
           notes = nullif(trim(coalesce(p_notes, '')), ''),
           active = coalesce(p_active, true)
     where id = p_supplier_id
     returning id into v_supplier_id;

    if v_supplier_id is null then
      raise exception 'supplier not found' using errcode = 'P0002';
    end if;
    v_action := 'CONTROL_SUPPLIER_UPDATE';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'suppliers',
    v_supplier_id::text,
    v_action,
    jsonb_build_object('name', v_name, 'active', coalesce(p_active, true))
  );

  return query select v_supplier_id;
end;
$$;

create or replace function public.admin_set_supplier_active(
  p_supplier_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['operations', 'admin', 'owner']) then
    raise exception 'supplier management permission required' using errcode = '42501';
  end if;

  if not coalesce(p_active, false) and exists (
    select 1 from public.purchase_orders
    where supplier_id = p_supplier_id
      and status not in ('received', 'cancelled')
  ) then
    raise exception 'supplier has open purchase orders' using errcode = '23503';
  end if;

  update public.suppliers
     set active = coalesce(p_active, false)
   where id = p_supplier_id;

  if not found then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'suppliers',
    p_supplier_id::text,
    case when coalesce(p_active, false) then 'CONTROL_SUPPLIER_RESTORE' else 'CONTROL_SUPPLIER_ARCHIVE' end,
    jsonb_build_object('active', coalesce(p_active, false))
  );
end;
$$;

create or replace function public.admin_upsert_category(
  p_category_id uuid,
  p_parent_id uuid,
  p_slug text,
  p_name text,
  p_publisher text,
  p_description text,
  p_sort_order integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (category_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_action text;
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['catalog', 'admin', 'owner']) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lowercase words separated by hyphens' using errcode = '22023';
  end if;

  if v_name = '' then
    raise exception 'category name required' using errcode = '22023';
  end if;

  if coalesce(p_sort_order, 0) < 0 then
    raise exception 'sort order cannot be negative' using errcode = '22023';
  end if;

  if p_parent_id is not null then
    perform 1 from public.tcg_categories where id = p_parent_id;
    if not found then
      raise exception 'parent category not found' using errcode = 'P0002';
    end if;
  end if;

  if p_category_id is null then
    insert into public.tcg_categories (
      parent_id, slug, name, publisher, description, sort_order, active
    ) values (
      p_parent_id,
      v_slug,
      v_name,
      nullif(trim(coalesce(p_publisher, '')), ''),
      nullif(trim(coalesce(p_description, '')), ''),
      coalesce(p_sort_order, 0),
      coalesce(p_active, true)
    ) returning id into v_category_id;
    v_action := 'CONTROL_CATEGORY_CREATE';
  else
    update public.tcg_categories
       set parent_id = p_parent_id,
           slug = v_slug,
           name = v_name,
           publisher = nullif(trim(coalesce(p_publisher, '')), ''),
           description = nullif(trim(coalesce(p_description, '')), ''),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = p_category_id
     returning id into v_category_id;

    if v_category_id is null then
      raise exception 'category not found' using errcode = 'P0002';
    end if;
    v_action := 'CONTROL_CATEGORY_UPDATE';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'tcg_categories',
    v_category_id::text,
    v_action,
    jsonb_build_object('slug', v_slug, 'parent_id', p_parent_id, 'active', coalesce(p_active, true))
  );

  return query select v_category_id;
end;
$$;

create or replace function public.admin_set_category_active(
  p_category_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['catalog', 'admin', 'owner']) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if not coalesce(p_active, false) and (
    exists (select 1 from public.tcg_categories where parent_id = p_category_id and active)
    or exists (select 1 from public.sets_releases where category_id = p_category_id and active)
    or exists (select 1 from public.products where category_id = p_category_id and active)
  ) then
    raise exception 'category has active children, sets, or products' using errcode = '23503';
  end if;

  update public.tcg_categories
     set active = coalesce(p_active, false)
   where id = p_category_id;

  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'tcg_categories',
    p_category_id::text,
    case when coalesce(p_active, false) then 'CONTROL_CATEGORY_RESTORE' else 'CONTROL_CATEGORY_ARCHIVE' end,
    jsonb_build_object('active', coalesce(p_active, false))
  );
end;
$$;

create or replace function public.admin_upsert_set_release(
  p_set_id uuid,
  p_category_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_release_date date,
  p_preorder_open_at timestamptz,
  p_preorder_close_at timestamptz,
  p_status public.set_status,
  p_sort_order integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (set_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_code text := upper(trim(coalesce(p_code, '')));
  v_action text;
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['catalog', 'admin', 'owner']) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'set name required' using errcode = '22023';
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,15}$' then
    raise exception 'set code is invalid' using errcode = '22023';
  end if;

  if coalesce(p_sort_order, 0) < 0 then
    raise exception 'sort order cannot be negative' using errcode = '22023';
  end if;

  if p_preorder_open_at is not null
     and p_preorder_close_at is not null
     and p_preorder_close_at <= p_preorder_open_at then
    raise exception 'preorder close must be after preorder open' using errcode = '22023';
  end if;

  perform 1 from public.tcg_categories where id = p_category_id and active;
  if not found then
    raise exception 'active category not found' using errcode = 'P0002';
  end if;

  if p_set_id is null then
    insert into public.sets_releases (
      category_id, name, code, description, release_date,
      preorder_open_at, preorder_close_at, status, sort_order, active
    ) values (
      p_category_id,
      v_name,
      v_code,
      nullif(trim(coalesce(p_description, '')), ''),
      p_release_date,
      p_preorder_open_at,
      p_preorder_close_at,
      coalesce(p_status, 'announced'::public.set_status),
      coalesce(p_sort_order, 0),
      coalesce(p_active, true)
    ) returning id into v_set_id;
    v_action := 'CONTROL_SET_CREATE';
  else
    update public.sets_releases
       set category_id = p_category_id,
           name = v_name,
           code = v_code,
           description = nullif(trim(coalesce(p_description, '')), ''),
           release_date = p_release_date,
           preorder_open_at = p_preorder_open_at,
           preorder_close_at = p_preorder_close_at,
           status = coalesce(p_status, 'announced'::public.set_status),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = p_set_id
     returning id into v_set_id;

    if v_set_id is null then
      raise exception 'set not found' using errcode = 'P0002';
    end if;
    v_action := 'CONTROL_SET_UPDATE';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'sets_releases',
    v_set_id::text,
    v_action,
    jsonb_build_object('code', v_code, 'category_id', p_category_id, 'active', coalesce(p_active, true))
  );

  return query select v_set_id;
end;
$$;

create or replace function public.admin_set_set_release_active(
  p_set_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.control_actor_has_role(p_actor_auth_user_id, array['catalog', 'admin', 'owner']) then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;

  if not coalesce(p_active, false)
     and exists (select 1 from public.products where set_id = p_set_id and active) then
    raise exception 'set has active products' using errcode = '23503';
  end if;

  update public.sets_releases
     set active = coalesce(p_active, false)
   where id = p_set_id;

  if not found then
    raise exception 'set not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'sets_releases',
    p_set_id::text,
    case when coalesce(p_active, false) then 'CONTROL_SET_RESTORE' else 'CONTROL_SET_ARCHIVE' end,
    jsonb_build_object('active', coalesce(p_active, false))
  );
end;
$$;

create or replace function public.admin_upsert_access_grant(
  p_grant_id uuid,
  p_email text,
  p_role text,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (grant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_users%rowtype;
  v_target_staff public.staff_users%rowtype;
  v_grant_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, 'viewer')));
  v_current_role text;
  v_action text;
begin
  select * into v_actor
  from public.staff_users
  where auth_user_id = p_actor_auth_user_id
    and active
    and role in ('admin', 'owner');

  if v_actor.id is null then
    raise exception 'administrator management permission required' using errcode = '42501';
  end if;

  if v_email !~ '^[^,[:space:]@]+@[^,[:space:]@]+\.[^,[:space:]@]+$' then
    raise exception 'valid email required' using errcode = '22023';
  end if;

  if v_role not in ('viewer', 'support', 'catalog', 'operations', 'admin', 'owner') then
    raise exception 'invalid administrator role' using errcode = '22023';
  end if;

  select role into v_current_role
  from public.admin_access_grants
  where id = p_grant_id or email = v_email
  order by case when id = p_grant_id then 0 else 1 end
  limit 1;

  if (v_role = 'owner' or v_current_role = 'owner') and v_actor.role <> 'owner' then
    raise exception 'only an owner can manage owner access' using errcode = '42501';
  end if;

  select * into v_target_staff
  from public.staff_users
  where lower(email) = v_email
  limit 1;

  if v_target_staff.source = 'environment'
     and (not coalesce(p_active, false) or v_role <> 'owner') then
    raise exception 'environment allowlisted owners are managed through ADMIN_EMAIL_ALLOWLIST'
      using errcode = '42501';
  end if;

  if v_target_staff.id = v_actor.id
     and (not coalesce(p_active, false) or v_role <> 'owner')
     and not exists (
       select 1 from public.staff_users
       where active and role = 'owner' and id <> v_actor.id
     ) then
    raise exception 'cannot remove or demote the final active owner' using errcode = '23514';
  end if;

  if p_grant_id is null then
    insert into public.admin_access_grants (
      email, role, active, created_by_staff_id, revoked_at
    ) values (
      v_email,
      v_role,
      coalesce(p_active, true),
      v_actor.id,
      case when coalesce(p_active, true) then null else now() end
    )
    on conflict (email) do update
      set role = excluded.role,
          active = excluded.active,
          revoked_at = case when excluded.active then null else now() end
    returning id into v_grant_id;
    v_action := 'CONTROL_ADMIN_GRANT_UPSERT';
  else
    update public.admin_access_grants
       set email = v_email,
           role = v_role,
           active = coalesce(p_active, true),
           revoked_at = case when coalesce(p_active, true) then null else now() end
     where id = p_grant_id
     returning id into v_grant_id;

    if v_grant_id is null then
      raise exception 'administrator grant not found' using errcode = 'P0002';
    end if;
    v_action := 'CONTROL_ADMIN_GRANT_UPDATE';
  end if;

  update public.staff_users
     set role = case when source = 'environment' then 'owner' else v_role end,
         active = case when source = 'environment' then true else coalesce(p_active, true) end,
         created_by_staff_id = coalesce(created_by_staff_id, v_actor.id)
   where lower(email) = v_email;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'admin_access_grants',
    v_grant_id::text,
    v_action,
    jsonb_build_object('email', v_email, 'role', v_role, 'active', coalesce(p_active, true))
  );

  return query select v_grant_id;
end;
$$;

revoke all on function public.admin_upsert_supplier(uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_supplier_active(uuid, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_category(uuid, uuid, text, text, text, text, integer, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_category_active(uuid, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_set_release(uuid, uuid, text, text, text, date, timestamptz, timestamptz, public.set_status, integer, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_set_release_active(uuid, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_access_grant(uuid, text, text, boolean, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_upsert_supplier(uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid)
  to service_role;
grant execute on function public.admin_set_supplier_active(uuid, boolean, uuid)
  to service_role;
grant execute on function public.admin_upsert_category(uuid, uuid, text, text, text, text, integer, boolean, uuid)
  to service_role;
grant execute on function public.admin_set_category_active(uuid, boolean, uuid)
  to service_role;
grant execute on function public.admin_upsert_set_release(uuid, uuid, text, text, text, date, timestamptz, timestamptz, public.set_status, integer, boolean, uuid)
  to service_role;
grant execute on function public.admin_set_set_release_active(uuid, boolean, uuid)
  to service_role;
grant execute on function public.admin_upsert_access_grant(uuid, text, text, boolean, uuid)
  to service_role;
