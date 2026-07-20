-- Separate catalog identity, commercial pricing, storefront publication, and
-- administrator domain coverage. New authorization tables are service-only;
-- public price reads are explicitly limited to current active prices.

begin;

create table public.control_permission_definitions (
  permission_key text primary key,
  domain_key text not null,
  label text not null,
  high_risk boolean not null default false,
  owner_only boolean not null default false,
  created_at timestamptz not null default now(),
  constraint control_permission_key_format
    check (permission_key ~ '^[a-z_]+\.[a-z_]+$'),
  constraint control_permission_domain_format
    check (domain_key ~ '^[a-z_]+$')
);

insert into public.control_permission_definitions
  (permission_key, domain_key, label, high_risk, owner_only)
values
  ('control.view', 'overview', 'View control centre', false, false),
  ('catalog.view', 'catalog', 'View catalog', false, false),
  ('catalog.manage', 'catalog', 'Manage catalog', false, false),
  ('pricing.view', 'pricing', 'View pricing', false, false),
  ('pricing.manage', 'pricing', 'Manage pricing', false, false),
  ('pricing.approve', 'pricing', 'Approve sensitive pricing', true, false),
  ('storefront.view', 'storefront', 'View storefront', false, false),
  ('storefront.manage', 'storefront', 'Manage listings', false, false),
  ('storefront.publish', 'storefront', 'Publish listings', true, false),
  ('supply.view', 'supply', 'View supply', false, false),
  ('suppliers.manage', 'supply', 'Manage suppliers', false, false),
  ('inventory.adjust', 'supply', 'Adjust inventory', true, false),
  ('purchase_orders.manage', 'supply', 'Manage purchase orders', true, false),
  ('orders.view', 'orders', 'View orders', false, false),
  ('orders.manage', 'orders', 'Manage orders', false, false),
  ('preorders.allocate', 'orders', 'Allocate preorders', true, false),
  ('fulfilment.view', 'fulfilment', 'View fulfilment', false, false),
  ('fulfilment.manage', 'fulfilment', 'Manage fulfilment', false, false),
  ('customers.view', 'customers', 'View customers', false, false),
  ('customers.manage', 'customers', 'Manage customer access', true, false),
  ('communications.manage', 'customers', 'Manage communications', false, false),
  ('finance.view', 'finance', 'View finance', false, false),
  ('payments.reconcile', 'finance', 'Reconcile payments', true, false),
  ('refunds.manage', 'finance', 'Manage refunds', true, false),
  ('governance.view', 'governance', 'View governance', false, false),
  ('governance.manage', 'governance', 'Manage administrators', true, true),
  ('audit.view', 'governance', 'View audit history', false, false)
on conflict (permission_key) do update
set domain_key = excluded.domain_key,
    label = excluded.label,
    high_risk = excluded.high_risk,
    owner_only = excluded.owner_only;

create table public.admin_access_grant_permissions (
  grant_id uuid not null references public.admin_access_grants(id) on delete cascade,
  permission_key text not null references public.control_permission_definitions(permission_key) on delete restrict,
  created_by_staff_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (grant_id, permission_key)
);

create index admin_access_grant_permissions_permission_idx
  on public.admin_access_grant_permissions (permission_key, grant_id);

alter table public.control_permission_definitions enable row level security;
alter table public.admin_access_grant_permissions enable row level security;

revoke all on table public.control_permission_definitions from public, anon, authenticated;
revoke all on table public.admin_access_grant_permissions from public, anon, authenticated;
grant select on table public.control_permission_definitions to service_role;
grant select, insert, update, delete on table public.admin_access_grant_permissions to service_role;

drop trigger if exists audit_log on public.admin_access_grant_permissions;
create trigger audit_log
  after insert or update or delete on public.admin_access_grant_permissions
  for each row execute function public.write_audit_log();

insert into public.admin_access_grant_permissions (grant_id, permission_key, created_by_staff_id)
select access_grant.id, permission.permission_key, access_grant.created_by_staff_id
from public.admin_access_grants access_grant
join public.control_permission_definitions permission
  on permission.permission_key = any(
    case access_grant.role
      when 'viewer' then array['control.view']
      when 'support' then array[
        'control.view', 'orders.view', 'customers.view',
        'communications.manage', 'audit.view'
      ]
      when 'catalog' then array[
        'control.view', 'catalog.view', 'catalog.manage', 'pricing.view',
        'storefront.view', 'audit.view'
      ]
      when 'operations' then array[
        'control.view', 'supply.view', 'suppliers.manage', 'inventory.adjust',
        'purchase_orders.manage', 'orders.view', 'orders.manage',
        'fulfilment.view', 'fulfilment.manage', 'audit.view'
      ]
      when 'admin' then array[
        'control.view', 'catalog.view', 'catalog.manage', 'pricing.view',
        'pricing.manage', 'pricing.approve', 'storefront.view', 'storefront.manage',
        'storefront.publish', 'supply.view', 'suppliers.manage', 'inventory.adjust',
        'purchase_orders.manage', 'orders.view', 'orders.manage', 'preorders.allocate',
        'fulfilment.view', 'fulfilment.manage', 'customers.view', 'customers.manage',
        'communications.manage', 'finance.view', 'payments.reconcile', 'refunds.manage',
        'governance.view', 'audit.view'
      ]
      else array(select permission_key from public.control_permission_definitions)
    end
  )
on conflict do nothing;

create or replace function public.control_actor_has_permission(
  p_actor_auth_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = p_actor_auth_user_id
      and staff.active
      and (
        (staff.source = 'environment' and staff.role = 'owner')
        or exists (
          select 1
          from public.admin_access_grants access_grant
          join public.admin_access_grant_permissions permission
            on permission.grant_id = access_grant.id
          where access_grant.active
            and permission.permission_key = p_permission
            and (
              access_grant.auth_user_id = p_actor_auth_user_id
              or access_grant.email = lower(staff.email)
            )
        )
      )
  );
$$;

revoke all on function public.control_actor_has_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.control_actor_has_permission(uuid, text) to service_role;

-- Preserve defense-in-depth checks in existing catalog and supply RPCs while
-- allowing custom domain grants instead of relying on one exclusive role.
create or replace function public.control_actor_has_role(
  p_actor_auth_user_id uuid,
  p_roles text[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if 'catalog' = any(p_roles) then
    return public.control_actor_has_permission(p_actor_auth_user_id, 'catalog.manage');
  end if;
  if 'operations' = any(p_roles) then
    return public.control_actor_has_permission(p_actor_auth_user_id, 'suppliers.manage')
      or public.control_actor_has_permission(p_actor_auth_user_id, 'inventory.adjust')
      or public.control_actor_has_permission(p_actor_auth_user_id, 'purchase_orders.manage');
  end if;
  return public.control_actor_has_permission(p_actor_auth_user_id, 'governance.manage');
end;
$$;

create or replace function public.admin_upsert_access_grant_permissions(
  p_grant_id uuid,
  p_email text,
  p_role text,
  p_permissions text[],
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (grant_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.staff_users%rowtype;
  v_target_staff public.staff_users%rowtype;
  v_grant_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, 'viewer')));
  v_current_role text;
  v_permissions text[];
  v_action text;
begin
  select * into v_actor
  from public.staff_users
  where auth_user_id = p_actor_auth_user_id and active;

  if v_actor.id is null
     or not public.control_actor_has_permission(p_actor_auth_user_id, 'governance.manage') then
    raise exception 'administrator management permission required' using errcode = '42501';
  end if;

  if v_email !~ '^[^,[:space:]@]+@[^,[:space:]@]+\.[^,[:space:]@]+$' then
    raise exception 'valid email required' using errcode = '22023';
  end if;
  if v_role not in ('viewer', 'support', 'catalog', 'operations', 'admin', 'owner') then
    raise exception 'invalid administrator access template' using errcode = '22023';
  end if;

  select array_agg(distinct requested.permission_key order by requested.permission_key)
    into v_permissions
  from unnest(array_append(coalesce(p_permissions, array[]::text[]), 'control.view'))
    as requested(permission_key)
  join public.control_permission_definitions definition
    on definition.permission_key = requested.permission_key;

  if exists (
    select 1 from unnest(coalesce(p_permissions, array[]::text[])) requested(permission_key)
    where not exists (
      select 1 from public.control_permission_definitions definition
      where definition.permission_key = requested.permission_key
    )
  ) then
    raise exception 'unknown administrator permission' using errcode = '22023';
  end if;

  select role into v_current_role
  from public.admin_access_grants
  where id = p_grant_id or email = v_email
  order by case when id = p_grant_id then 0 else 1 end
  limit 1;

  if (v_role = 'owner' or v_current_role = 'owner'
      or 'governance.manage' = any(v_permissions))
     and v_actor.role <> 'owner' then
    raise exception 'only an owner can manage privileged access' using errcode = '42501';
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
      v_email, v_role, coalesce(p_active, true), v_actor.id,
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

  delete from public.admin_access_grant_permissions where grant_id = v_grant_id;
  insert into public.admin_access_grant_permissions (
    grant_id, permission_key, created_by_staff_id
  )
  select v_grant_id, permission_key, v_actor.id from unnest(v_permissions) permission_key;

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
    jsonb_build_object(
      'email', v_email,
      'role', v_role,
      'active', coalesce(p_active, true),
      'permissions', to_jsonb(v_permissions)
    )
  );

  return query select v_grant_id;
end;
$$;

revoke all on function public.admin_upsert_access_grant_permissions(
  uuid, text, text, text[], boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_access_grant_permissions(
  uuid, text, text, text[], boolean, uuid
) to service_role;

-- Pricing is versioned independently from the physical SKU. The legacy SKU
-- amount columns remain a read-only checkout cache during this migration.
alter table public.booster_box_skus
  drop constraint if exists booster_box_skus_price_cents_check;
alter table public.booster_box_skus
  alter column price_cents set default 0,
  add constraint booster_box_skus_price_cents_check check (price_cents >= 0);

comment on column public.booster_box_skus.price_cents is
  'Current-price compatibility cache maintained from sku_prices; never edit directly.';
comment on column public.booster_box_skus.msrp_cents is
  'Current comparison-price compatibility cache maintained from sku_prices; never edit directly.';

-- Remove superseded service-role mutation surfaces that combined catalog,
-- pricing, or publication authority. Their replacements below are domain-specific.
drop function if exists public.admin_upsert_booster_box_sku(
  uuid, uuid, text, text, integer, integer, integer, integer,
  text, integer, boolean, text
);
drop function if exists public.admin_upsert_listing_item(
  uuid, text, text, text[], integer, integer, integer, boolean, boolean, text
);
drop function if exists public.admin_upsert_catalog_product_with_publication(
  uuid, text, uuid, uuid, text, text, text, text, boolean, boolean, text
);
drop function if exists public.admin_create_catalog_product_with_publication(
  uuid, text, text, text, uuid, text, text, date, public.set_status,
  text, text, text, text, text, text, text, boolean, boolean, uuid
);

create table public.sku_prices (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.booster_box_skus(id) on delete cascade,
  currency text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  price_cents integer not null check (price_cents > 0),
  compare_at_cents integer check (
    compare_at_cents is null or compare_at_cents >= price_cents
  ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by_staff_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sku_prices_valid_window check (ends_at is null or ends_at > starts_at)
);

create unique index sku_prices_one_open_price
  on public.sku_prices (sku_id, currency)
  where active and ends_at is null;
create index sku_prices_current_lookup
  on public.sku_prices (sku_id, currency, active, starts_at desc, ends_at);

alter table public.sku_prices enable row level security;
revoke all on table public.sku_prices from public, anon, authenticated;
grant select on table public.sku_prices to anon, authenticated;
grant select, insert, update, delete on table public.sku_prices to service_role;

create policy "current active sku prices are readable"
  on public.sku_prices for select
  to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop trigger if exists set_updated_at on public.sku_prices;
create trigger set_updated_at before update on public.sku_prices
  for each row execute function public.set_updated_at();
drop trigger if exists audit_log on public.sku_prices;
create trigger audit_log after insert or update or delete on public.sku_prices
  for each row execute function public.write_audit_log();

insert into public.sku_prices (
  sku_id, currency, price_cents, compare_at_cents, active, starts_at
)
select
  id,
  upper(currency),
  price_cents,
  -- Legacy data did not require MSRP to be at least the selling price. Treat
  -- inverted values as no comparison price so the forward migration remains
  -- safe without changing the authoritative selling price.
  case
    when msrp_cents >= price_cents then msrp_cents
    else null
  end,
  true,
  created_at
from public.booster_box_skus
where price_cents > 0
on conflict do nothing;

create or replace function public.sync_sku_price_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sku_id uuid := coalesce(new.sku_id, old.sku_id);
  v_price public.sku_prices%rowtype;
begin
  select * into v_price
  from public.sku_prices price
  where price.sku_id = v_sku_id
    and price.active
    and price.starts_at <= now()
    and (price.ends_at is null or price.ends_at > now())
  order by price.starts_at desc, price.created_at desc
  limit 1;

  update public.booster_box_skus
     set price_cents = coalesce(v_price.price_cents, 0),
         msrp_cents = v_price.compare_at_cents,
         currency = coalesce(v_price.currency, currency)
   where id = v_sku_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_sku_price_cache() from public, anon, authenticated;
drop trigger if exists sync_sku_price_cache on public.sku_prices;
create trigger sync_sku_price_cache
  after insert or update or delete on public.sku_prices
  for each row execute function public.sync_sku_price_cache();

create or replace function public.admin_upsert_catalog_sku(
  p_sku_id uuid,
  p_product_id uuid,
  p_sku text,
  p_barcode text,
  p_packs_per_box integer,
  p_cards_per_pack integer,
  p_weight_grams integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (sku_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variant_id uuid;
  v_sku text := upper(trim(coalesce(p_sku, '')));
  v_sku_id uuid;
  v_action text;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'catalog.manage') then
    raise exception 'catalog management permission required' using errcode = '42501';
  end if;
  if v_sku = '' then
    raise exception 'sku required' using errcode = '22023';
  end if;
  if p_packs_per_box is not null and p_packs_per_box < 0
     or p_cards_per_pack is not null and p_cards_per_pack < 0
     or p_weight_grams is not null and p_weight_grams < 0 then
    raise exception 'physical SKU values must be non-negative' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

  insert into public.product_variants (product_id, name)
  values (p_product_id, 'default')
  on conflict (product_id, name) do update set updated_at = now()
  returning id into v_variant_id;

  if p_sku_id is null then
    insert into public.booster_box_skus (
      product_variant_id, sku, barcode, packs_per_box, cards_per_pack,
      price_cents, currency, weight_grams, active
    ) values (
      v_variant_id, v_sku, nullif(trim(coalesce(p_barcode, '')), ''),
      p_packs_per_box, p_cards_per_pack, 0, 'SGD', p_weight_grams,
      coalesce(p_active, true)
    ) returning id into v_sku_id;
    v_action := 'ADMIN_SKU_CREATE';
  else
    update public.booster_box_skus
       set product_variant_id = v_variant_id,
           sku = v_sku,
           barcode = nullif(trim(coalesce(p_barcode, '')), ''),
           packs_per_box = p_packs_per_box,
           cards_per_pack = p_cards_per_pack,
           weight_grams = p_weight_grams,
           active = coalesce(p_active, true)
     where id = p_sku_id
     returning id into v_sku_id;
    if v_sku_id is null then raise exception 'sku not found' using errcode = 'P0002'; end if;
    v_action := 'ADMIN_SKU_UPDATE';
  end if;

  insert into public.inventory (sku_id, location)
  values (v_sku_id, 'main')
  on conflict on constraint inventory_sku_id_location_key do nothing;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'booster_box_skus', v_sku_id::text,
    v_action,
    jsonb_build_object('sku_id', v_sku_id, 'product_id', p_product_id, 'sku', v_sku)
  );
  return query select v_sku_id;
end;
$$;

revoke all on function public.admin_upsert_catalog_sku(
  uuid, uuid, text, text, integer, integer, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_catalog_sku(
  uuid, uuid, text, text, integer, integer, integer, boolean, uuid
) to service_role;

create or replace function public.admin_set_sku_price(
  p_sku_id uuid,
  p_currency text,
  p_price_cents integer,
  p_compare_at_cents integer,
  p_actor_auth_user_id uuid
)
returns table (price_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text := upper(trim(coalesce(p_currency, 'SGD')));
  v_staff_id uuid;
  v_price_id uuid;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.manage') then
    raise exception 'pricing management permission required' using errcode = '42501';
  end if;
  if v_currency !~ '^[A-Z]{3}$' or p_price_cents is null or p_price_cents <= 0 then
    raise exception 'valid currency and positive price required' using errcode = '22023';
  end if;
  if p_compare_at_cents is not null and p_compare_at_cents < p_price_cents then
    raise exception 'comparison price cannot be below selling price' using errcode = '22023';
  end if;
  perform 1 from public.booster_box_skus where id = p_sku_id;
  if not found then raise exception 'sku not found' using errcode = 'P0002'; end if;

  select id into v_staff_id from public.staff_users
  where auth_user_id = p_actor_auth_user_id and active;

  update public.sku_prices
     set active = false, ends_at = now()
   where sku_id = p_sku_id and currency = v_currency and active;

  insert into public.sku_prices (
    sku_id, currency, price_cents, compare_at_cents, starts_at,
    active, created_by_staff_id
  ) values (
    p_sku_id, v_currency, p_price_cents, p_compare_at_cents, now(), true, v_staff_id
  ) returning id into v_price_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'sku_prices', v_price_id::text,
    'CONTROL_SKU_PRICE_SET',
    jsonb_build_object(
      'sku_id', p_sku_id, 'currency', v_currency,
      'price_cents', p_price_cents, 'compare_at_cents', p_compare_at_cents
    )
  );
  return query select v_price_id;
end;
$$;

revoke all on function public.admin_set_sku_price(uuid, text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_sku_price(uuid, text, integer, integer, uuid)
  to service_role;

-- Keep the mature promotion validation internally, but expose it only through
-- permission-aware Pricing wrappers.
revoke execute on function public.admin_upsert_limited_time_deal(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, text
) from service_role;
revoke execute on function public.admin_set_limited_time_deal_active(uuid, boolean, text)
  from service_role;

create or replace function public.admin_upsert_pricing_promotion(
  p_deal_id uuid,
  p_code text,
  p_sku_id uuid,
  p_title text,
  p_description text,
  p_discount_bps integer,
  p_visibility text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_sort_priority integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (deal_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.manage') then
    raise exception 'pricing management permission required' using errcode = '42501';
  end if;
  if coalesce(p_active, false)
     and not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.approve') then
    raise exception 'sensitive pricing approval required' using errcode = '42501';
  end if;

  return query
  select legacy.deal_id
  from public.admin_upsert_limited_time_deal(
    p_deal_id, p_code, p_sku_id, p_title, p_description,
    p_discount_bps, p_visibility, p_starts_at, p_ends_at,
    p_sort_priority, p_active, concat('staff:', p_actor_auth_user_id)
  ) legacy;
end;
$$;

revoke all on function public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
) to service_role;

create or replace function public.admin_set_pricing_promotion_active(
  p_deal_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.approve') then
    raise exception 'sensitive pricing approval required' using errcode = '42501';
  end if;
  perform public.admin_set_limited_time_deal_active(
    p_deal_id, p_active, concat('staff:', p_actor_auth_user_id)
  );
end;
$$;

revoke all on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  to service_role;

alter table public.listing_items
  alter column published set default false,
  add column if not exists availability_mode text not null default 'unavailable'
    check (availability_mode in ('available_now', 'preorder', 'coming_soon', 'unavailable')),
  add column if not exists order_open_at timestamptz,
  add column if not exists order_close_at timestamptz,
  add column if not exists release_date date,
  add constraint listing_items_order_window
    check (order_close_at is null or order_open_at is null or order_close_at > order_open_at);

update public.listing_items
set availability_mode = case when published then 'available_now' else 'unavailable' end
where availability_mode = 'unavailable';

create or replace function public.create_default_listing_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.listing_items (product_id, published, availability_mode)
  values (new.id, false, 'unavailable')
  on conflict (product_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_default_listing_item() from public, anon, authenticated;
grant execute on function public.create_default_listing_item() to service_role;

create or replace function public.admin_upsert_storefront_listing(
  p_product_id uuid,
  p_title_override text,
  p_badge_label text,
  p_tags text[],
  p_max_per_customer integer,
  p_preorder_reserve integer,
  p_sort_priority integer,
  p_featured boolean,
  p_availability_mode text,
  p_order_open_at timestamptz,
  p_order_close_at timestamptz,
  p_release_date date,
  p_actor_auth_user_id uuid
)
returns table (listing_item_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing_id uuid;
  v_current_published boolean := false;
  v_tags text[] := array[]::text[];
  v_product_active boolean;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'storefront.manage') then
    raise exception 'storefront management permission required' using errcode = '42501';
  end if;
  if p_availability_mode not in ('available_now', 'preorder', 'coming_soon', 'unavailable') then
    raise exception 'invalid listing availability mode' using errcode = '22023';
  end if;
  if p_max_per_customer is not null and p_max_per_customer <= 0 then
    raise exception 'max per customer must be positive' using errcode = '22023';
  end if;
  if coalesce(p_preorder_reserve, 0) < 0 then
    raise exception 'preorder reserve must be non-negative' using errcode = '22023';
  end if;
  if p_order_open_at is not null and p_order_close_at is not null
     and p_order_close_at <= p_order_open_at then
    raise exception 'order close must be after order open' using errcode = '22023';
  end if;

  select product.active into v_product_active
  from public.products product where product.id = p_product_id;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

  select listing.published into v_current_published
  from public.listing_items listing where listing.product_id = p_product_id;
  v_current_published := coalesce(v_current_published, false);

  -- Content editors cannot leave an already-published listing in an invalid
  -- state. Publication itself is owned by admin_set_listing_publication.
  if v_current_published then
    if not coalesce(v_product_active, false) then
      raise exception 'an archived product cannot be published' using errcode = '23514';
    end if;
    if p_availability_mode = 'unavailable' then
      raise exception 'choose an availability mode before publishing' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.booster_box_skus sku
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id and sku.active
    ) then
      raise exception 'an active physical SKU is required before publishing' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.sku_prices price
      join public.booster_box_skus sku on sku.id = price.sku_id
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id
        and sku.active and price.active and price.starts_at <= now()
        and (price.ends_at is null or price.ends_at > now())
    ) then
      raise exception 'a current SKU price is required before publishing' using errcode = '23514';
    end if;
    if p_availability_mode = 'available_now' and not exists (
      select 1
      from public.inventory inventory
      join public.booster_box_skus sku on sku.id = inventory.sku_id
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id and sku.active
        and inventory.available > inventory.safety_stock
    ) then
      raise exception 'available-now publication requires sellable inventory' using errcode = '23514';
    end if;
  end if;

  select coalesce(array_agg(cleaned_tag order by cleaned_tag), array[]::text[])
    into v_tags
  from (
    select distinct trim(tag) cleaned_tag
    from unnest(coalesce(p_tags, array[]::text[])) raw(tag)
  ) tags
  where cleaned_tag <> '';

  insert into public.listing_items as listing (
    product_id, title_override, badge_label, tags, channels,
    max_per_customer, preorder_reserve, sort_priority, featured,
    availability_mode, order_open_at, order_close_at, release_date, published
  ) values (
    p_product_id, nullif(trim(coalesce(p_title_override, '')), ''),
    nullif(trim(coalesce(p_badge_label, '')), ''), v_tags, array['b2c']::text[],
    p_max_per_customer, coalesce(p_preorder_reserve, 0),
    coalesce(p_sort_priority, 0), coalesce(p_featured, false),
    p_availability_mode, p_order_open_at, p_order_close_at, p_release_date,
    false
  )
  on conflict on constraint listing_items_product_id_key do update set
    title_override = excluded.title_override,
    badge_label = excluded.badge_label,
    tags = excluded.tags,
    max_per_customer = excluded.max_per_customer,
    preorder_reserve = excluded.preorder_reserve,
    sort_priority = excluded.sort_priority,
    featured = excluded.featured,
    availability_mode = excluded.availability_mode,
    order_open_at = excluded.order_open_at,
    order_close_at = excluded.order_close_at,
    release_date = excluded.release_date,
    updated_at = now()
  returning listing.id into v_listing_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'listing_items', v_listing_id::text,
    'CONTROL_STOREFRONT_LISTING_SAVE',
    jsonb_build_object(
      'product_id', p_product_id,
      'availability_mode', p_availability_mode,
      'published', v_current_published
    )
  );
  return query select v_listing_id;
end;
$$;

revoke all on function public.admin_upsert_storefront_listing(
  uuid, text, text, text[], integer, integer, integer, boolean,
  text, timestamptz, timestamptz, date, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_storefront_listing(
  uuid, text, text, text[], integer, integer, integer, boolean,
  text, timestamptz, timestamptz, date, uuid
) to service_role;

create or replace function public.admin_set_listing_publication(
  p_product_id uuid,
  p_published boolean,
  p_actor_auth_user_id uuid
)
returns table (listing_item_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listing_items%rowtype;
  v_product_active boolean;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'storefront.publish') then
    raise exception 'storefront publication permission required' using errcode = '42501';
  end if;

  select * into v_listing
  from public.listing_items listing where listing.product_id = p_product_id;
  if v_listing.id is null then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  if coalesce(p_published, false) then
    select product.active into v_product_active
    from public.products product where product.id = p_product_id;
    if not coalesce(v_product_active, false) then
      raise exception 'an archived product cannot be published' using errcode = '23514';
    end if;
    if v_listing.availability_mode = 'unavailable' then
      raise exception 'choose an availability mode before publishing' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.booster_box_skus sku
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id and sku.active
    ) then
      raise exception 'an active physical SKU is required before publishing' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.sku_prices price
      join public.booster_box_skus sku on sku.id = price.sku_id
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id
        and sku.active and price.active and price.starts_at <= now()
        and (price.ends_at is null or price.ends_at > now())
    ) then
      raise exception 'a current SKU price is required before publishing' using errcode = '23514';
    end if;
    if v_listing.availability_mode = 'available_now' and not exists (
      select 1
      from public.inventory inventory
      join public.booster_box_skus sku on sku.id = inventory.sku_id
      join public.product_variants variant on variant.id = sku.product_variant_id
      where variant.product_id = p_product_id and sku.active
        and inventory.available > inventory.safety_stock
    ) then
      raise exception 'available-now publication requires sellable inventory' using errcode = '23514';
    end if;
  end if;

  update public.listing_items
     set published = coalesce(p_published, false), updated_at = now()
   where id = v_listing.id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id), 'listing_items', v_listing.id::text,
    case when coalesce(p_published, false)
      then 'CONTROL_STOREFRONT_LISTING_PUBLISH'
      else 'CONTROL_STOREFRONT_LISTING_UNPUBLISH'
    end,
    jsonb_build_object('product_id', p_product_id, 'published', coalesce(p_published, false))
  );
  return query select v_listing.id;
end;
$$;

revoke all on function public.admin_set_listing_publication(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_listing_publication(uuid, boolean, uuid)
  to service_role;

commit;
