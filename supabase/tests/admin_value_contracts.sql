\set ON_ERROR_STOP on

begin;

do $$
declare
  v_owner_auth_user_id uuid := '10000000-0000-4000-8000-000000000201';
  v_bound_auth_user_id uuid := '10000000-0000-4000-8000-000000000202';
  v_wrong_auth_user_id uuid := '10000000-0000-4000-8000-000000000203';
  v_owner_staff_id uuid;
  v_wrong_staff_id uuid;
  v_grant_id uuid;
  v_category_id uuid;
  v_other_category_id uuid := gen_random_uuid();
  v_set_id uuid;
  v_product_id uuid;
  v_sku_id uuid;
  v_supplier_id uuid;
  v_permissions text[];
begin
  insert into auth.users (id, email)
  values
    (v_owner_auth_user_id, 'value-contract-owner@example.test'),
    (v_bound_auth_user_id, 'bound-identity@example.test'),
    (v_wrong_auth_user_id, 'invited-operator@example.test');

  insert into public.staff_users (auth_user_id, role, active, email, source)
  values (
    v_owner_auth_user_id,
    'owner',
    true,
    'value-contract-owner@example.test',
    'environment'
  )
  returning id into v_owner_staff_id;

  -- This row deliberately has the invitation email but not the identity that
  -- accepted the grant. Email fallback must never authorize it.
  insert into public.staff_users (auth_user_id, role, active, email, source)
  values (
    v_wrong_auth_user_id,
    'operations',
    true,
    'invited-operator@example.test',
    'database'
  )
  returning id into v_wrong_staff_id;

  insert into public.admin_access_grants (
    email,
    role,
    active,
    auth_user_id,
    created_by_staff_id,
    accepted_at
  ) values (
    'invited-operator@example.test',
    'operations',
    true,
    v_bound_auth_user_id,
    v_owner_staff_id,
    now()
  )
  returning id into v_grant_id;

  insert into public.admin_access_grant_permissions (
    grant_id,
    permission_key,
    created_by_staff_id
  ) values (
    v_grant_id,
    'inventory.adjust',
    v_owner_staff_id
  );

  if public.control_actor_has_permission(v_wrong_auth_user_id, 'inventory.adjust') then
    raise exception 'an invitation email incorrectly authorized another identity';
  end if;

  begin
    update public.admin_access_grants
    set auth_user_id = v_wrong_auth_user_id
    where id = v_grant_id;
    raise exception 'an accepted administrator grant was rebound';
  exception
    when check_violation then null;
  end;

  begin
    update public.admin_access_grants
    set email = 'changed-invitation@example.test'
    where id = v_grant_id;
    raise exception 'an accepted administrator email was changed';
  exception
    when check_violation then null;
  end;

  v_permissions := public.normalized_control_permissions(
    array['inventory.adjust'],
    'operations'
  );
  if not (
    'control.view' = any(v_permissions)
    and 'supply.view' = any(v_permissions)
    and 'inventory.adjust' = any(v_permissions)
  ) then
    raise exception 'write permission did not retain its domain read permissions: %', v_permissions;
  end if;

  begin
    perform public.normalized_control_permissions(array['governance.manage'], 'admin');
    raise exception 'owner-only permission was assigned to a non-owner';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.normalized_control_permissions(array['control.view'], 'owner');
    raise exception 'owner template omitted administrator management';
  exception
    when invalid_parameter_value then null;
  end;

  select category.id, release.id
    into v_category_id, v_set_id
  from public.sets_releases release
  join public.tcg_categories category on category.id = release.category_id
  order by release.created_at, release.id
  limit 1;

  insert into public.tcg_categories (id, slug, name)
  values (v_other_category_id, 'value-contract-other', 'Value Contract Other');

  begin
    insert into public.products (
      name,
      category_id,
      set_id,
      product_type,
      language
    ) values (
      'Invalid Cross Category Product',
      v_other_category_id,
      v_set_id,
      'contract_test',
      'EN'
    );
    raise exception 'a product accepted a set from another category';
  exception
    when foreign_key_violation then null;
  end;

  select product.id
    into v_product_id
  from public.products product
  order by product.created_at, product.id
  limit 1;

  begin
    insert into public.listing_items (product_id, tags)
    values (
      v_product_id,
      array[
        'one', 'two', 'three', 'four', 'five', 'six', 'seven',
        'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'
      ]
    );
    raise exception 'a listing accepted more than twelve tags';
  exception
    when check_violation then null;
  end;

  select sku.id
    into v_sku_id
  from public.booster_box_skus sku
  order by sku.created_at, sku.id
  limit 1;

  begin
    insert into public.sku_prices (
      sku_id,
      currency,
      price_cents,
      compare_at_cents,
      active,
      starts_at,
      ends_at
    ) values (
      v_sku_id,
      'SGD',
      19900,
      19900,
      false,
      now() - interval '2 hours',
      now() - interval '1 hour'
    );
    raise exception 'comparison price was not above the selling price';
  exception
    when check_violation then null;
  end;

  select supplier.id
    into v_supplier_id
  from public.suppliers supplier
  where supplier.active
  order by supplier.created_at, supplier.id
  limit 1;

  begin
    perform public.admin_upsert_supplier(
      null,
      (select name from public.suppliers where id = v_supplier_id),
      'distributor',
      'SG',
      '{}'::jsonb,
      null,
      null,
      'SGD',
      null,
      true,
      v_owner_auth_user_id
    );
    raise exception 'a duplicate normalized supplier name was created';
  exception
    when unique_violation then null;
  end;

  begin
    perform public.admin_create_supplier_purchase_order(
      v_supplier_id,
      v_sku_id,
      1,
      100,
      'SGD',
      current_date + 7,
      'permission contract',
      v_wrong_auth_user_id
    );
    raise exception 'purchase order intake ignored its exact permission';
  exception
    when insufficient_privilege then null;
  end;

  update public.inventory
  set on_hand = 5,
      incoming = 0,
      allocated = 5
  where sku_id = v_sku_id and location = 'main';

  begin
    perform public.admin_adjust_inventory(
      v_sku_id,
      0,
      0,
      0,
      'stock_count',
      'allocated stock contract',
      v_owner_auth_user_id
    );
    raise exception 'inventory was reduced below its allocated quantity';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
