\set ON_ERROR_STOP on

begin;

do $$
declare
  v_owner_auth_user_id uuid := '10000000-0000-4000-8000-000000000211';
  v_owner_staff_id uuid;
  v_grant_id uuid;
  v_updated_grant_id uuid;
  v_permissions text[];
begin
  insert into auth.users (id, email)
  values (v_owner_auth_user_id, 'grant-save-owner@example.test');

  insert into public.staff_users (auth_user_id, role, active, email, source)
  values (
    v_owner_auth_user_id,
    'owner',
    true,
    'grant-save-owner@example.test',
    'environment'
  )
  returning id into v_owner_staff_id;

  select saved.grant_id
    into v_grant_id
  from public.admin_upsert_access_grant_permissions(
    null,
    'delegated-admin-save@example.test',
    'catalog',
    array['catalog.manage'],
    true,
    v_owner_auth_user_id
  ) saved;

  if v_grant_id is null then
    raise exception 'administrator access grant creation did not return an id';
  end if;

  select array_agg(permission.permission_key order by permission.permission_key)
    into v_permissions
  from public.admin_access_grant_permissions permission
  where permission.grant_id = v_grant_id;

  if v_permissions is distinct from array['catalog.manage', 'catalog.view', 'control.view'] then
    raise exception 'administrator access creation stored unexpected permissions: %', v_permissions;
  end if;

  select saved.grant_id
    into v_updated_grant_id
  from public.admin_upsert_access_grant_permissions(
    v_grant_id,
    'delegated-admin-save@example.test',
    'operations',
    array['inventory.adjust'],
    true,
    v_owner_auth_user_id
  ) saved;

  if v_updated_grant_id is distinct from v_grant_id then
    raise exception 'administrator access update returned the wrong grant id';
  end if;

  select array_agg(permission.permission_key order by permission.permission_key)
    into v_permissions
  from public.admin_access_grant_permissions permission
  where permission.grant_id = v_grant_id;

  if v_permissions is distinct from array['control.view', 'inventory.adjust', 'supply.view'] then
    raise exception 'administrator access update did not replace coverage: %', v_permissions;
  end if;

  if not exists (
    select 1
    from public.admin_access_grants access_grant
    where access_grant.id = v_grant_id
      and access_grant.email = 'delegated-admin-save@example.test'
      and access_grant.role = 'operations'
      and access_grant.active
  ) then
    raise exception 'administrator access grant metadata was not updated';
  end if;
end;
$$;

rollback;
