\set ON_ERROR_STOP on

begin;

do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'customers',
    'preorders',
    'orders',
    'order_items',
    'payments',
    'shipments',
    'notifications'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled for public.%', v_table;
    end if;

    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and 'authenticated' = any(p.roles)
    ) then
      raise exception 'public.% has no authenticated customer policy', v_table;
    end if;

    if exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname like 'own %'
        and 'public' = any(p.roles)
    ) then
      raise exception 'public.% ownership policy is still granted to public', v_table;
    end if;
  end loop;

  if to_regclass('public.b2b_accounts') is not null then
    raise exception 'wholesale account table still exists';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'customers'
    and policyname = 'own customer row update';

  if not found then
    raise exception 'customer update policy is missing';
  end if;
  if v_policy.cmd <> 'UPDATE' then
    raise exception 'customer update policy has unexpected command %', v_policy.cmd;
  end if;
  if v_policy.qual is null or v_policy.with_check is null then
    raise exception 'customer update policy must include USING and WITH CHECK';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('staff_users', 'audit_logs', 'webhook_events', 'refunds', 'suppliers')
      and ('anon' = any(roles) or 'authenticated' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'service-only table exposes a public or authenticated policy';
  end if;

  if has_table_privilege('authenticated', 'storage.objects', 'INSERT')
     or has_table_privilege('authenticated', 'storage.objects', 'UPDATE')
     or has_table_privilege('authenticated', 'storage.objects', 'DELETE') then
    raise exception 'authenticated users can bypass the server admin gate for product images';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'staff can upload product images',
        'staff can update product images',
        'staff can delete product images'
      )
  ) then
    raise exception 'legacy direct staff product-image policies are still present';
  end if;
end;
$$;

rollback;
