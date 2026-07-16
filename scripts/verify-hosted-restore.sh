#!/usr/bin/env bash
set -euo pipefail

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"
: "${RECOVERY_DATABASE_URL:?RECOVERY_DATABASE_URL is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"
: "${RECOVERY_PROJECT_REF:?RECOVERY_PROJECT_REF is required}"

if [[ "${RESTORE_DRILL_ALLOW_DESTRUCTIVE:-}" != "I_UNDERSTAND" ]]; then
  echo "RESTORE_DRILL_ALLOW_DESTRUCTIVE=I_UNDERSTAND is required" >&2
  exit 1
fi
if [[ "$STAGING_PROJECT_REF" == "$RECOVERY_PROJECT_REF" ]]; then
  echo "Staging and recovery project refs must differ" >&2
  exit 1
fi
if [[ "$STAGING_DATABASE_URL" == "$RECOVERY_DATABASE_URL" ]]; then
  echo "Staging and recovery database URLs must differ" >&2
  exit 1
fi
if [[ "$STAGING_DATABASE_URL" != *"$STAGING_PROJECT_REF"* ]]; then
  echo "STAGING_DATABASE_URL does not contain STAGING_PROJECT_REF" >&2
  exit 1
fi
if [[ "$RECOVERY_DATABASE_URL" != *"$RECOVERY_PROJECT_REF"* ]]; then
  echo "RECOVERY_DATABASE_URL does not contain RECOVERY_PROJECT_REF" >&2
  exit 1
fi

rto_seconds="${RESTORE_RTO_SECONDS:-1800}"
if ! [[ "$rto_seconds" =~ ^[1-9][0-9]*$ ]]; then
  echo "RESTORE_RTO_SECONDS must be a positive integer" >&2
  exit 1
fi

run_id="$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
marker_key="restore_drill_${run_id//[^A-Za-z0-9_]/_}"
work_dir="${RUNNER_TEMP:-/tmp}/marketplace-hosted-restore-${run_id}"
dump_file="$work_dir/public.dump"
mkdir -p "$work_dir"

cleanup() {
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "delete from public.storefront_configurations where \"key\" = '$marker_key'" \
    >/dev/null 2>&1 || true
  psql "$RECOVERY_DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "delete from public.storefront_configurations where \"key\" = '$marker_key'" \
    >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
insert into public.storefront_configurations ("key", label, description, value, active)
values (
  '$marker_key',
  'Hosted restore drill marker',
  'Ephemeral record proving the selected recovery point was restored.',
  jsonb_build_object('run_id', '$run_id', 'created_at', now()),
  false
)
on conflict ("key") do update
set value = excluded.value,
    updated_at = now();
SQL

start_epoch="$(date +%s)"

pg_dump "$STAGING_DATABASE_URL" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --file="$dump_file"

# This target must be a dedicated disposable recovery project. The explicit
# acknowledgement and project-ref checks above prevent accidental production use.
pg_restore "$RECOVERY_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$dump_file"

psql "$RECOVERY_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
do \$\$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.inventory') is null
     or to_regclass('public.staff_users') is null
     or to_regclass('public.storefront_configurations') is null
     or to_regclass('public.limited_time_deals') is null then
    raise exception 'recovery database is missing critical commerce tables';
  end if;

  if to_regclass('public.b2b_accounts') is not null
     or to_regclass('public.pricing_tiers') is not null
     or to_regclass('public.customer_pricing_tiers') is not null then
    raise exception 'recovery database restored retired wholesale tables';
  end if;

  if not exists (
    select 1
    from public.storefront_configurations
    where "key" = '$marker_key'
      and value->>'run_id' = '$run_id'
  ) then
    raise exception 'restore marker was not recovered';
  end if;

  if not exists (
    select 1
    from public.storefront_configurations
    where "key" = 'shipping_policy'
      and active
  ) then
    raise exception 'recovery database is missing active shipping policy';
  end if;

  if exists (
    select 1
    from public.storefront_configurations
    where "key" = 'b2b_invoice_policy'
  ) then
    raise exception 'recovery database restored retired invoice policy';
  end if;

  if exists (
    select 1
    from public.inventory
    where allocated < 0 or on_hand < 0 or incoming < 0 or safety_stock < 0
  ) then
    raise exception 'recovery database contains invalid inventory quantities';
  end if;
end;
\$\$;
SQL

end_epoch="$(date +%s)"
duration_seconds="$((end_epoch - start_epoch))"
if (( duration_seconds > rto_seconds )); then
  echo "Hosted restore completed in ${duration_seconds}s, exceeding RTO ${rto_seconds}s" >&2
  exit 1
fi

cat > "${GITHUB_STEP_SUMMARY:-/dev/null}" <<EOF
## Hosted restore drill

- Source project: \`$STAGING_PROJECT_REF\`
- Disposable recovery project: \`$RECOVERY_PROJECT_REF\`
- Public schema dump and clean restore: passed
- Recovery marker: passed
- Critical retail tables, policies, and wholesale decommission: passed
- Duration: ${duration_seconds}s
- Required RTO: ${rto_seconds}s
EOF

echo "Hosted restore drill passed in ${duration_seconds}s."
