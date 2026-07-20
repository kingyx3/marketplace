-- Keep the set lifecycle guard intact while allowing the catalog form to select
-- a later lifecycle state. The database advances through each required adjacent
-- state in the same transaction instead of attempting an invalid direct jump.

begin;

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
set search_path = public, pg_temp
as $$
declare
  v_set_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_code text := upper(trim(coalesce(p_code, '')));
  v_action text;
  v_current_status public.set_status;
  v_target_status public.set_status := coalesce(p_status, 'announced'::public.set_status);
  v_current_rank integer;
  v_target_rank integer;
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

  v_target_rank := case v_target_status
    when 'announced' then 1
    when 'preorder_open' then 2
    when 'preorder_closed' then 3
    when 'released' then 4
    when 'out_of_print' then 5
  end;

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
      'announced'::public.set_status,
      coalesce(p_sort_order, 0),
      coalesce(p_active, true)
    ) returning id, status into v_set_id, v_current_status;
    v_action := 'CONTROL_SET_CREATE';
  else
    select release.status
      into v_current_status
    from public.sets_releases release
    where release.id = p_set_id
    for update;

    if not found then
      raise exception 'set not found' using errcode = 'P0002';
    end if;

    v_current_rank := case v_current_status
      when 'announced' then 1
      when 'preorder_open' then 2
      when 'preorder_closed' then 3
      when 'released' then 4
      when 'out_of_print' then 5
    end;

    if v_target_rank < v_current_rank then
      raise exception 'set status cannot move backwards from % to %', v_current_status, v_target_status
        using errcode = '22023';
    end if;

    update public.sets_releases
       set category_id = p_category_id,
           name = v_name,
           code = v_code,
           description = nullif(trim(coalesce(p_description, '')), ''),
           release_date = p_release_date,
           preorder_open_at = p_preorder_open_at,
           preorder_close_at = p_preorder_close_at,
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = p_set_id
     returning id into v_set_id;

    v_action := 'CONTROL_SET_UPDATE';
  end if;

  v_current_rank := case v_current_status
    when 'announced' then 1
    when 'preorder_open' then 2
    when 'preorder_closed' then 3
    when 'released' then 4
    when 'out_of_print' then 5
  end;

  if v_current_rank < 2 and v_target_rank >= 2 then
    update public.sets_releases
       set status = 'preorder_open'::public.set_status
     where id = v_set_id;
  end if;

  if v_current_rank < 3 and v_target_rank >= 3 then
    update public.sets_releases
       set status = 'preorder_closed'::public.set_status
     where id = v_set_id;
  end if;

  if v_current_rank < 4 and v_target_rank >= 4 then
    update public.sets_releases
       set status = 'released'::public.set_status
     where id = v_set_id;
  end if;

  if v_current_rank < 5 and v_target_rank >= 5 then
    update public.sets_releases
       set status = 'out_of_print'::public.set_status
     where id = v_set_id;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'sets_releases',
    v_set_id::text,
    v_action,
    jsonb_build_object(
      'code', v_code,
      'category_id', p_category_id,
      'status', v_target_status,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_set_id;
end;
$$;

revoke all on function public.admin_upsert_set_release(
  uuid, uuid, text, text, text, date, timestamptz, timestamptz,
  public.set_status, integer, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.admin_upsert_set_release(
  uuid, uuid, text, text, text, date, timestamptz, timestamptz,
  public.set_status, integer, boolean, uuid
) to service_role;

commit;
