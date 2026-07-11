# Backup and restore runbook

This runbook covers the minimum recovery controls for the marketplace PostgreSQL database and product-image storage. It does not replace the managed Supabase backup service or a tested organizational disaster-recovery plan.

## Required production controls

Before enabling customer orders:

1. Confirm the production Supabase plan provides point-in-time recovery or scheduled backups at the required retention.
2. Record the configured retention window, recovery point objective (RPO), and recovery time objective (RTO).
3. Assign a primary recovery owner and a second approver.
4. Confirm product-image storage retention and recovery separately from PostgreSQL.
5. Run a restoration drill into an isolated Supabase project using production-shaped data.
6. Record the drill date, backup timestamp, restore duration, validation results, and any data loss relative to the target recovery point.

Do not assume a provider feature is enabled merely because it is available on the account tier.

## Pre-deployment backup gate

For a production migration that changes commercial state, payment functions, inventory logic, or authorization:

- Confirm the most recent recoverable point is within the approved RPO.
- Confirm the recovery owner can access the Supabase organization and project.
- Export the migration list and release SHA.
- Review forward-revert SQL for changed functions and constraints.
- Do not run a destructive or irreversible data migration without a tested copy against production-shaped data.

## Logical backup command

Use a temporary secure workstation or CI runner with an approved direct database connection. Never put the database password in command history or logs.

```bash
PGPASSWORD="$SUPABASE_DB_PASSWORD" pg_dump \
  --host "$SUPABASE_DB_HOST" \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --format custom \
  --no-owner \
  --no-privileges \
  --file marketplace-backup.dump
```

Store the dump only in an approved encrypted location with access logging and retention controls. The dump can contain customer personal information, shipping addresses, payment metadata, and operational audit records.

## Isolated restore procedure

Never restore over the production project during a drill.

1. Create an isolated recovery database or Supabase project in the correct region.
2. Restrict network and operator access.
3. Restore the logical dump:

```bash
PGPASSWORD="$RESTORE_DB_PASSWORD" pg_restore \
  --host "$RESTORE_DB_HOST" \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  marketplace-backup.dump
```

4. Apply no new migrations until the restored release version is identified.
5. Validate the database before allowing application access.

## Restore validation

At minimum, verify:

- `orders`, `order_items`, `payments`, `refunds`, `preorders`, `inventory`, and `audit_logs` exist.
- The latest expected migrations/functions are present.
- Order totals equal item totals, discounts, shipping, and tax according to the stored contract.
- Payment provider references remain unique.
- Inventory allocation values are non-negative and do not exceed the intended stock state.
- Pending invoice orders have valid payment and allocation deadlines.
- RLS remains enabled on customer/commercial tables and grants match the release.
- A test customer can read only their own order history.
- Active staff can access the required admin operation and a deactivated staff user cannot.
- Stripe and notification providers remain disabled in the isolated restore environment.

## Storage recovery

Product images are not contained in the PostgreSQL logical dump.

- Confirm the `product-images` bucket inventory is exported or protected by provider-supported recovery.
- Record object count and sample checksums before a major migration.
- Restore into a non-public recovery bucket first.
- Validate object paths against product image URLs before promoting recovered objects.

## Production recovery decision

The incident commander must choose one of these paths:

- **Application rollback only:** promote the previous immutable Vercel deployment when the schema remains backward compatible.
- **Forward database repair:** deploy a reviewed forward migration when data is intact but logic is defective.
- **Point-in-time recovery:** use provider PITR when corruption or deletion affects a known time window.
- **Logical restore:** use an approved dump when provider recovery is unavailable or a portable recovery is required.

Document the selected recovery point, expected data loss, customer impact, and reconciliation plan before execution.

## Post-restore reconciliation

After recovery:

1. Keep checkout disabled until payment and inventory reconciliation is complete.
2. Compare restored Stripe payment/refund references with provider records after the recovery point.
3. Identify orders, refunds, webhooks, and invoice payments created after the restored point.
4. Reapply or compensate missing external events idempotently.
5. Reconcile inventory allocations and fulfilled shipments.
6. Notify affected customers according to the incident and privacy process.
7. Record evidence and corrective actions in the incident report.

## CI restore check

The pull-request migration job creates a custom-format logical dump after applying all migrations, seed data, and transactional checkout tests. It restores that dump into a separate PostgreSQL database and verifies critical tables, checkout functions, policy records, and seeded catalog data.

This CI check proves that the repository schema can be logically dumped and restored. It does **not** prove that production PITR is enabled, that provider backups meet the required retention, or that a real production-sized restore meets the RTO.
