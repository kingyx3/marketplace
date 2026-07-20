\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor_auth_user_id uuid := '10000000-0000-4000-8000-000000000114';
  v_category_id uuid := '20000000-0000-4000-8000-000000000114';
  v_set_id uuid;
  v_status public.set_status;
begin
  insert into auth.users (id, email)
  values (v_actor_auth_user_id, 'set-lifecycle-contract@example.test');

  insert into public.staff_users (
    auth_user_id, role, active, email, source
  ) values (
    v_actor_auth_user_id,
    'owner',
    true,
    'set-lifecycle-contract@example.test',
    'environment'
  );

  insert into public.tcg_categories (
    id, slug, name, publisher, active, sort_order
  ) values (
    v_category_id,
    'set-lifecycle-contract',
    'Set lifecycle contract',
    'Contract publisher',
    true,
    0
  );

  select result.set_id
    into v_set_id
  from public.admin_upsert_set_release(
    null,
    v_category_id,
    'Lifecycle Release',
    'LIFECYCLE',
    'Lifecycle progression contract',
    '2026-08-15',
    '2026-07-20 01:00:00+00',
    '2026-08-10 15:59:00+00',
    'released',
    0,
    true,
    v_actor_auth_user_id
  ) as result;

  select status into v_status
  from public.sets_releases
  where id = v_set_id;

  if v_status <> 'released'::public.set_status then
    raise exception 'new set did not progress to released: %', v_status;
  end if;

  perform 1
  from public.admin_upsert_set_release(
    v_set_id,
    v_category_id,
    'Lifecycle Release',
    'LIFECYCLE',
    'Lifecycle progression contract',
    '2026-08-15',
    '2026-07-20 01:00:00+00',
    '2026-08-10 15:59:00+00',
    'out_of_print',
    0,
    true,
    v_actor_auth_user_id
  );

  select status into v_status
  from public.sets_releases
  where id = v_set_id;

  if v_status <> 'out_of_print'::public.set_status then
    raise exception 'existing set did not progress to out of print: %', v_status;
  end if;

  begin
    perform 1
    from public.admin_upsert_set_release(
      v_set_id,
      v_category_id,
      'Lifecycle Release',
      'LIFECYCLE',
      'Lifecycle progression contract',
      '2026-08-15',
      '2026-07-20 01:00:00+00',
      '2026-08-10 15:59:00+00',
      'released',
      0,
      true,
      v_actor_auth_user_id
    );
    raise exception 'backward set status transition was accepted';
  exception
    when sqlstate '22023' then
      if position('cannot move backwards' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end;
$$;

rollback;
