-- Fix the TCGplayer import RPC after its RETURNS TABLE product_id output
-- collided with product_variants.product_id in the ON CONFLICT target.
-- Use the named unique constraint so PL/pgSQL does not resolve a bare
-- product_id identifier against the output variable.

begin;

do $$
declare
  v_function regprocedure := 'public.admin_create_tcgplayer_catalog_product(uuid,text,text,text,uuid,text,text,date,public.set_status,text,text,text,text,text,text,text,boolean,bigint,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_fixed_definition text;
begin
  select pg_get_functiondef(v_function::oid)
    into v_definition;

  v_fixed_definition := regexp_replace(
    v_definition,
    'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*product_id[[:space:]]*,[[:space:]]*name[[:space:]]*\)[[:space:]]+do[[:space:]]+update',
    'on conflict on constraint product_variants_product_id_name_key do update',
    'i'
  );

  if v_fixed_definition is not distinct from v_definition then
    raise exception 'TCGplayer catalog import conflict target was not found';
  end if;

  execute v_fixed_definition;
end;
$$;

commit;
