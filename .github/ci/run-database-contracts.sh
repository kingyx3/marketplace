#!/usr/bin/env bash
set -Eeuo pipefail

LOG_FILE="${MIGRATION_LOG_FILE:-migration.log}"
VERIFY_LOGICAL_RESTORE="${VERIFY_LOGICAL_RESTORE:-false}"

: > "$LOG_FILE"

run_logged() {
  "$@" 2>&1 | tee -a "$LOG_FILE"
}

run_logged psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f .github/ci/auth-shim.sql

for file in supabase/migrations/*.sql; do
  printf 'applying %s\n' "$file" | tee -a "$LOG_FILE"
  run_logged psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f "$file"
done

run_logged psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f supabase/seed.sql

for file in supabase/tests/*.sql; do
  printf 'testing %s\n' "$file" | tee -a "$LOG_FILE"
  run_logged psql -h localhost -U postgres -v ON_ERROR_STOP=1 -f "$file"
done

if [[ "$VERIFY_LOGICAL_RESTORE" == "true" ]]; then
  run_logged bash .github/ci/verify-logical-restore.sh
fi
