#!/usr/bin/env bash
set -euo pipefail

host="${PGHOST:-localhost}"
user="${PGUSER:-postgres}"
source_db="${PGDATABASE:-postgres}"
restore_db="marketplace_restore_test"
backup_file="${RUNNER_TEMP:-/tmp}/marketplace-logical-backup.dump"

cleanup() {
  dropdb --if-exists -h "$host" -U "$user" "$restore_db" >/dev/null 2>&1 || true
  rm -f "$backup_file"
}
trap cleanup EXIT

cleanup

pg_dump \
  -h "$host" \
  -U "$user" \
  -d "$source_db" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$backup_file"

createdb -h "$host" -U "$user" "$restore_db"
pg_restore \
  -h "$host" \
  -U "$user" \
  -d "$restore_db" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$backup_file"

psql -h "$host" -U "$user" -d "$restore_db" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.inventory') is null
     or to_regclass('public.storefront_configurations') is null
     or to_regclass('public.limited_time_deals') is null then
    raise exception 'restored database is missing critical retail commerce tables';
  end if;

  if to_regclass('public.b2b_accounts') is not null
     or to_regclass('public.pricing_tiers') is not null
     or to_regclass('public.customer_pricing_tiers') is not null
     or to_regprocedure('public.create_b2b_invoice_order_from_cart(uuid,jsonb,jsonb,text,integer,integer,integer,integer)') is not null then
    raise exception 'restored database contains retired wholesale capabilities';
  end if;

  if not exists (
    select 1
    from public.products
    where slug = 'smp-play-booster-box'
  ) then
    raise exception 'restored database is missing seeded catalog data';
  end if;

  if not exists (
    select 1
    from public.storefront_configurations
    where "key" = 'shipping_policy'
      and active
  ) then
    raise exception 'restored database is missing active shipping policy';
  end if;

  if exists (
    select 1
    from public.storefront_configurations
    where "key" = 'b2b_invoice_policy'
  ) then
    raise exception 'restored database contains retired invoice policy';
  end if;
end;
$$;
SQL

echo "Logical backup and restore verification passed."
