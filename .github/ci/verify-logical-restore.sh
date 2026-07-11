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
     or to_regclass('public.storefront_configurations') is null then
    raise exception 'restored database is missing critical commerce tables';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_b2b_invoice_order_from_cart'
  ) then
    raise exception 'restored database is missing invoice checkout function';
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
    where "key" in ('shipping_policy', 'b2b_invoice_policy')
    group by true
    having count(*) = 2
  ) then
    raise exception 'restored database is missing checkout policy records';
  end if;
end;
$$;
SQL

echo "Logical backup and restore verification passed."
