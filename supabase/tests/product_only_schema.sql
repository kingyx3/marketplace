\set ON_ERROR_STOP on

do $$
declare
  v_name text;
begin
  select table_name into v_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('product_variants', 'booster_box_skus', 'sku_prices', 'inventory')
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog table remains: %', v_name;
  end if;

  select table_name || '.' || column_name into v_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name ~* '(^|_)sku(_|$)'
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog column remains: %', v_name;
  end if;

  select routine_name into v_name
  from information_schema.routines
  where routine_schema = 'public'
    and routine_name ~* 'sku'
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog routine remains: %', v_name;
  end if;

  select class.relname into v_name
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname ~* 'sku'
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog relation remains: %', v_name;
  end if;

  select constraint_row.conname into v_name
  from pg_constraint constraint_row
  join pg_namespace namespace on namespace.oid = constraint_row.connamespace
  where namespace.nspname = 'public'
    and constraint_row.conname ~* 'sku'
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog constraint remains: %', v_name;
  end if;

  select procedure.proname into v_name
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prosrc ~* '(sku_id|booster_box_skus|product_variants|sku_prices)'
  limit 1;
  if v_name is not null then
    raise exception 'legacy catalog implementation remains: %', v_name;
  end if;
end;
$$;
