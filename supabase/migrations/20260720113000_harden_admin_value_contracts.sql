-- Enforce the same bounded value and relationship contracts at the trusted
-- database boundary as the administrative forms. Existing rows are not
-- rewritten merely to satisfy new presentation limits; NOT VALID checks still
-- protect every new or updated row and can be validated after legacy cleanup.

begin;

create or replace function public.admin_text_array_is_valid(
  p_values text[],
  p_max_items integer,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(cardinality(p_values), 0) <= p_max_items
    and not exists (
      select 1
      from unnest(coalesce(p_values, array[]::text[])) value
      where value is null
         or value <> trim(value)
         or length(value) = 0
         or length(value) > p_max_length
    )
    and (
      select count(*) = count(distinct lower(value))
      from unnest(coalesce(p_values, array[]::text[])) value
    );
$$;

revoke all on function public.admin_text_array_is_valid(text[], integer, integer)
  from public, anon, authenticated;

alter table public.suppliers
  add constraint suppliers_admin_name_length
    check (char_length(trim(name)) between 2 and 160) not valid,
  add constraint suppliers_admin_region_length
    check (region is null or char_length(trim(region)) between 1 and 160) not valid,
  add constraint suppliers_admin_currency_format
    check (currency ~ '^[A-Z]{3}$') not valid,
  add constraint suppliers_admin_payment_terms_length
    check (payment_terms is null or char_length(trim(payment_terms)) between 1 and 500) not valid,
  add constraint suppliers_admin_notes_length
    check (notes is null or char_length(trim(notes)) between 1 and 2000) not valid,
  add constraint suppliers_admin_contact_shape
    check (
      jsonb_typeof(contact) = 'object'
      and (
        contact->>'name' is null
        or char_length(trim(contact->>'name')) between 1 and 160
      )
      and (
        contact->>'email' is null
        or (
          char_length(trim(contact->>'email')) between 3 and 320
          and contact->>'email' ~ '^[^,[:space:]@]+@[^,[:space:]@]+\.[^,[:space:]@]+$'
        )
      )
      and (
        contact->>'phone' is null
        or char_length(trim(contact->>'phone')) between 1 and 80
      )
    ) not valid;

alter table public.tcg_categories
  add constraint tcg_categories_admin_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160) not valid,
  add constraint tcg_categories_admin_name_length
    check (char_length(trim(name)) between 2 and 160) not valid,
  add constraint tcg_categories_admin_publisher_length
    check (publisher is null or char_length(trim(publisher)) between 1 and 160) not valid,
  add constraint tcg_categories_admin_description_length
    check (description is null or char_length(trim(description)) between 1 and 2000) not valid;

alter table public.sets_releases
  add constraint sets_releases_admin_name_length
    check (char_length(trim(name)) between 2 and 160) not valid,
  add constraint sets_releases_admin_code_format
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,15}$') not valid,
  add constraint sets_releases_admin_description_length
    check (description is null or char_length(trim(description)) between 1 and 2000) not valid,
  add constraint sets_releases_admin_preorder_window
    check (
      preorder_close_at is null or preorder_open_at is null
      or preorder_close_at > preorder_open_at
    ) not valid;

alter table public.sets_releases
  add constraint sets_releases_id_category_key unique (id, category_id);

alter table public.products
  add constraint products_set_belongs_to_category
    foreign key (set_id, category_id)
    references public.sets_releases (id, category_id)
    not valid,
  add constraint products_admin_name_length
    check (char_length(trim(name)) between 2 and 160) not valid,
  add constraint products_admin_type_format
    check (product_type ~ '^[a-z][a-z0-9_]{0,63}$') not valid,
  add constraint products_admin_description_length
    check (description is null or char_length(trim(description)) between 1 and 2000) not valid,
  add constraint products_admin_language_format
    check (language ~ '^[A-Z]{2,8}$') not valid,
  add constraint products_admin_image_url_length
    check (
      image_url is null
      or (
        char_length(trim(image_url)) between 1 and 2048
        and image_url ~* '^https?://'
      )
    ) not valid;

alter table public.booster_box_skus
  add constraint booster_box_skus_admin_sku_format
    check (sku ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$') not valid,
  add constraint booster_box_skus_admin_barcode_length
    check (barcode is null or char_length(trim(barcode)) between 1 and 64) not valid,
  add constraint booster_box_skus_admin_physical_values
    check (
      (packs_per_box is null or packs_per_box > 0)
      and (cards_per_pack is null or cards_per_pack > 0)
      and (weight_grams is null or weight_grams > 0)
    ) not valid,
  add constraint booster_box_skus_admin_currency_format
    check (currency ~ '^[A-Z]{3}$') not valid;

alter table public.purchase_orders
  add constraint purchase_orders_admin_currency_format
    check (currency ~ '^[A-Z]{3}$') not valid,
  add constraint purchase_orders_admin_notes_length
    check (notes is null or char_length(trim(notes)) between 1 and 500) not valid;

alter table public.purchase_order_items
  add constraint purchase_order_items_received_within_ordered
    check (received_quantity <= quantity) not valid;

alter table public.listing_items
  add constraint listing_items_admin_title_length
    check (title_override is null or char_length(trim(title_override)) between 1 and 180) not valid,
  add constraint listing_items_admin_badge_length
    check (badge_label is null or char_length(trim(badge_label)) between 1 and 80) not valid,
  add constraint listing_items_admin_tags
    check (public.admin_text_array_is_valid(tags, 12, 80)) not valid;

alter table public.storefront_configurations
  add constraint storefront_configurations_admin_key_length
    check (char_length("key") <= 120) not valid,
  add constraint storefront_configurations_admin_label_length
    check (char_length(trim(label)) between 1 and 160) not valid,
  add constraint storefront_configurations_admin_description_length
    check (description is null or char_length(trim(description)) between 1 and 500) not valid,
  add constraint storefront_configurations_admin_value_shape
    check (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 131072) not valid;

alter table public.limited_time_deals
  add constraint limited_time_deals_admin_code_length
    check (char_length(code) between 1 and 80) not valid,
  add constraint limited_time_deals_admin_title_length
    check (char_length(trim(title)) between 1 and 160) not valid,
  add constraint limited_time_deals_admin_description_length
    check (description is null or char_length(trim(description)) between 1 and 500) not valid;

alter table public.shipments
  add constraint shipments_admin_carrier_length
    check (carrier is null or char_length(trim(carrier)) between 1 and 80) not valid,
  add constraint shipments_admin_tracking_length
    check (tracking_number is null or char_length(trim(tracking_number)) between 1 and 120) not valid,
  add constraint shipments_admin_address_shape
    check (
      address is null or (
        jsonb_typeof(address) = 'object'
        and char_length(trim(coalesce(address->>'recipientName', ''))) between 1 and 120
        and char_length(trim(coalesce(address->>'line1', ''))) between 1 and 200
        and char_length(trim(coalesce(address->>'line2', ''))) <= 200
        and char_length(trim(coalesce(address->>'city', ''))) <= 120
        and char_length(trim(coalesce(address->>'state', ''))) <= 120
        and char_length(trim(coalesce(address->>'postalCode', ''))) between 1 and 32
        and address->>'countryCode' = upper(trim(address->>'countryCode'))
        and address->>'countryCode' ~ '^[A-Z]{2}$'
        and char_length(trim(coalesce(address->>'phone', ''))) <= 50
      )
    ) not valid;

alter table public.admin_access_grants
  add constraint admin_access_grants_email_length
    check (char_length(email) <= 320) not valid,
  add constraint admin_access_grants_identity_acceptance
    check (auth_user_id is null or accepted_at is not null) not valid,
  add constraint admin_access_grants_revocation_state
    check ((active and revoked_at is null) or (not active and revoked_at is not null)) not valid;

-- A compare-at amount equal to the selling price communicates no discount.
-- Normalize that legacy edge before strengthening the future contract.
update public.sku_prices
set compare_at_cents = null
where compare_at_cents is not null and compare_at_cents <= price_cents;

alter table public.sku_prices
  drop constraint if exists sku_prices_compare_at_cents_check;
alter table public.sku_prices
  add constraint sku_prices_compare_at_cents_check
    check (compare_at_cents is null or compare_at_cents > price_cents);

create or replace function public.prevent_accepted_admin_grant_rebinding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.accepted_at is not null and new.email <> old.email then
    raise exception 'accepted administrator email is immutable; revoke and create a new grant'
      using errcode = '23514';
  end if;
  if old.accepted_at is not null and new.auth_user_id is distinct from old.auth_user_id then
    if new.auth_user_id is not null then
      raise exception 'accepted administrator identity cannot be rebound'
        using errcode = '23514';
    end if;
    -- Preserve auth.users deletion semantics while ensuring the orphaned grant
    -- cannot authorize another identity.
    new.active := false;
    new.revoked_at := coalesce(new.revoked_at, now());
  end if;
  if old.accepted_at is not null and old.auth_user_id is null and new.active then
    raise exception 'an orphaned accepted grant cannot be reactivated; create a new grant'
      using errcode = '23514';
  end if;
  if old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at then
    raise exception 'administrator acceptance timestamp is immutable'
      using errcode = '23514';
  end if;
  if new.auth_user_id is not null and new.accepted_at is null then
    raise exception 'accepted administrator identity requires an acceptance timestamp'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_accepted_admin_grant_rebinding on public.admin_access_grants;
create trigger prevent_accepted_admin_grant_rebinding
  before update of email, auth_user_id, accepted_at, active on public.admin_access_grants
  for each row execute function public.prevent_accepted_admin_grant_rebinding();

-- Once a delegated grant is accepted, database authorization uses the bound
-- auth identity exclusively. Email is only the invitation lookup key.
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
            and access_grant.auth_user_id = p_actor_auth_user_id
            and permission.permission_key = p_permission
        )
      )
  );
$$;

revoke all on function public.control_actor_has_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.control_actor_has_permission(uuid, text) to service_role;

create or replace function public.normalized_control_permissions(
  p_permissions text[],
  p_role text
)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_permissions text[];
begin
  if exists (
    select 1
    from unnest(coalesce(p_permissions, array[]::text[])) requested(permission_key)
    where not exists (
      select 1 from public.control_permission_definitions definition
      where definition.permission_key = requested.permission_key
    )
  ) then
    raise exception 'unknown administrator permission' using errcode = '22023';
  end if;

  select array_agg(distinct permission_key order by permission_key)
    into v_permissions
  from (
    select requested.permission_key
    from unnest(coalesce(p_permissions, array[]::text[])) requested(permission_key)
    union all
    select 'control.view'
    union all
    select domain_view.permission_key
    from unnest(coalesce(p_permissions, array[]::text[])) requested(permission_key)
    join public.control_permission_definitions selected
      on selected.permission_key = requested.permission_key
    join public.control_permission_definitions domain_view
      on domain_view.domain_key = selected.domain_key
     and domain_view.permission_key like '%.view'
  ) normalized;

  if p_role = 'owner' and not ('governance.manage' = any(v_permissions)) then
    raise exception 'owner access must include administrator management'
      using errcode = '22023';
  end if;
  if p_role <> 'owner' and 'governance.manage' = any(v_permissions) then
    raise exception 'administrator management can only be assigned to an owner'
      using errcode = '22023';
  end if;
  return v_permissions;
end;
$$;

revoke all on function public.normalized_control_permissions(text[], text)
  from public, anon, authenticated;

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
  v_existing public.admin_access_grants%rowtype;
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
  if char_length(v_email) > 320
     or v_email !~ '^[^,[:space:]@]+@[^,[:space:]@]+\.[^,[:space:]@]+$' then
    raise exception 'valid email required' using errcode = '22023';
  end if;
  if v_role not in ('viewer', 'support', 'catalog', 'operations', 'admin', 'owner') then
    raise exception 'invalid administrator access template' using errcode = '22023';
  end if;

  if p_grant_id is not null then
    select * into v_existing
    from public.admin_access_grants
    where id = p_grant_id
    for update;
    if v_existing.id is null then
      raise exception 'administrator grant not found' using errcode = 'P0002';
    end if;
    if v_existing.auth_user_id is not null and v_existing.email <> v_email then
      raise exception 'accepted administrator email is immutable; revoke and create a new grant'
        using errcode = '23514';
    end if;
    v_current_role := v_existing.role;
  else
    select role into v_current_role
    from public.admin_access_grants
    where email = v_email
    for update;
  end if;

  v_permissions := public.normalized_control_permissions(p_permissions, v_role);

  if (v_role = 'owner' or v_current_role = 'owner') and v_actor.role <> 'owner' then
    raise exception 'only an owner can manage owner access' using errcode = '42501';
  end if;

  select * into v_target_staff
  from public.staff_users
  where lower(email) = coalesce(v_existing.email, v_email)
  limit 1;

  if v_target_staff.source = 'environment'
     and (not coalesce(p_active, false) or v_role <> 'owner') then
    raise exception 'environment allowlisted owners are managed through ADMIN_EMAIL_ALLOWLIST'
      using errcode = '42501';
  end if;

  if v_target_staff.id = v_actor.id
     and (not coalesce(p_active, false) or v_role <> 'owner')
     and not exists (
       select 1 from public.staff_users other_staff
       where other_staff.active and other_staff.role = 'owner' and other_staff.id <> v_actor.id
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
       set role = v_role,
           active = coalesce(p_active, true),
           revoked_at = case when coalesce(p_active, true) then null else now() end
     where id = p_grant_id
     returning id into v_grant_id;
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

-- Wrap the older service-only supply functions with the exact action
-- permission and cross-record readiness checks used by the control pages.
alter function public.admin_upsert_supplier(
  uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid
) rename to legacy_admin_upsert_supplier;
revoke all on function public.legacy_admin_upsert_supplier(
  uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid
) from public, anon, authenticated, service_role;

create function public.admin_upsert_supplier(
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
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'suppliers.manage') then
    raise exception 'supplier management permission required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(coalesce(p_name, ''))), 0));
  if exists (
    select 1 from public.suppliers supplier
    where lower(trim(supplier.name)) = lower(trim(p_name))
      and supplier.id is distinct from p_supplier_id
  ) then
    raise exception 'supplier name already exists' using errcode = '23505';
  end if;
  return query
  select legacy.supplier_id
  from public.legacy_admin_upsert_supplier(
    p_supplier_id, p_name, p_supplier_type, p_region, p_contact,
    p_payment_terms, p_min_order_cents, p_currency, p_notes,
    p_active, p_actor_auth_user_id
  ) legacy;
end;
$$;

revoke all on function public.admin_upsert_supplier(
  uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_supplier(
  uuid, text, text, text, jsonb, text, integer, text, text, boolean, uuid
) to service_role;

alter function public.admin_set_supplier_active(uuid, boolean, uuid)
  rename to legacy_admin_set_supplier_active;
revoke all on function public.legacy_admin_set_supplier_active(uuid, boolean, uuid)
  from public, anon, authenticated, service_role;

create function public.admin_set_supplier_active(
  p_supplier_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'suppliers.manage') then
    raise exception 'supplier management permission required' using errcode = '42501';
  end if;
  perform public.legacy_admin_set_supplier_active(
    p_supplier_id, p_active, p_actor_auth_user_id
  );
end;
$$;

revoke all on function public.admin_set_supplier_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_supplier_active(uuid, boolean, uuid)
  to service_role;

alter function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, text
) rename to legacy_admin_adjust_inventory;
revoke all on function public.legacy_admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, text
) from public, anon, authenticated, service_role;

create function public.admin_adjust_inventory(
  p_sku_id uuid,
  p_on_hand integer,
  p_incoming integer,
  p_safety_stock integer,
  p_reason_code text,
  p_reason_note text,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocated integer;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'inventory.adjust') then
    raise exception 'inventory adjustment permission required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason_note, ''))) > 500 then
    raise exception 'inventory reason note must be 500 characters or fewer'
      using errcode = '22023';
  end if;
  select allocated into v_allocated
  from public.inventory
  where sku_id = p_sku_id and location = 'main'
  for update;
  if coalesce(v_allocated, 0) > coalesce(p_on_hand, 0) + coalesce(p_incoming, 0) then
    raise exception 'inventory cannot be reduced below already allocated quantity'
      using errcode = '23514';
  end if;
  perform public.legacy_admin_adjust_inventory(
    p_sku_id, p_on_hand, p_incoming, p_safety_stock,
    p_reason_code, p_reason_note, concat('staff:', p_actor_auth_user_id)
  );
end;
$$;

revoke all on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.admin_adjust_inventory(
  uuid, integer, integer, integer, text, text, uuid
) to service_role;

alter function public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, text
) rename to legacy_admin_create_supplier_purchase_order;
revoke all on function public.legacy_admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, text
) from public, anon, authenticated, service_role;

create function public.admin_create_supplier_purchase_order(
  p_supplier_id uuid,
  p_sku_id uuid,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_currency text,
  p_expected_at date,
  p_notes text,
  p_actor_auth_user_id uuid
)
returns table (purchase_order_id uuid, purchase_order_item_id uuid, incoming integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'purchase_orders.manage') then
    raise exception 'purchase order management permission required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_notes, ''))) > 500 then
    raise exception 'purchase order notes must be 500 characters or fewer'
      using errcode = '22023';
  end if;
  perform 1 from public.suppliers where id = p_supplier_id and active;
  if not found then raise exception 'active supplier not found' using errcode = 'P0002'; end if;
  perform 1
  from public.booster_box_skus sku
  join public.product_variants variant on variant.id = sku.product_variant_id
  join public.products product on product.id = variant.product_id
  where sku.id = p_sku_id and sku.active and product.active;
  if not found then raise exception 'active SKU not found' using errcode = 'P0002'; end if;

  return query
  select legacy.purchase_order_id, legacy.purchase_order_item_id, legacy.incoming
  from public.legacy_admin_create_supplier_purchase_order(
    p_supplier_id, p_sku_id, p_quantity, p_unit_cost_cents,
    p_currency, p_expected_at, p_notes, concat('staff:', p_actor_auth_user_id)
  ) legacy;
end;
$$;

revoke all on function public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.admin_create_supplier_purchase_order(
  uuid, uuid, integer, integer, text, date, text, uuid
) to service_role;

commit;
