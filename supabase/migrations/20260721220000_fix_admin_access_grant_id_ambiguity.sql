-- Fix administrator access saves after the RETURNS TABLE grant_id output
-- collided with admin_access_grant_permissions.grant_id in the permission reset.
-- Qualify the table column so PL/pgSQL cannot resolve the bare identifier
-- against the function output variable.

begin;

do $$
declare
  v_function regprocedure := 'public.admin_upsert_access_grant_permissions(uuid,text,text,text[],boolean,uuid)'::regprocedure;
  v_definition text;
  v_fixed_definition text;
begin
  select pg_get_functiondef(v_function::oid)
    into v_definition;

  v_fixed_definition := regexp_replace(
    v_definition,
    'delete[[:space:]]+from[[:space:]]+public\.admin_access_grant_permissions[[:space:]]+where[[:space:]]+grant_id[[:space:]]*=[[:space:]]*v_grant_id[[:space:]]*;',
    'delete from public.admin_access_grant_permissions grant_permission where grant_permission.grant_id = v_grant_id;',
    'i'
  );

  if v_fixed_definition is not distinct from v_definition then
    raise exception 'Administrator access grant permission reset was not found';
  end if;

  execute v_fixed_definition;
end;
$$;

commit;
