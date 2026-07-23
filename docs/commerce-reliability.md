# Commerce reliability runbook

Payment-provider redirects are advisory. Only the signed HitPay webhook and the
database settlement function can make an order paid.

## Runtime model

- `payment_attempts` and `refund_attempts` are written before provider calls.
- Provider timeouts and local persistence failures use `result_unknown`; they
  must not release the API idempotency claim or start a second money movement.
- `webhook_events` is a durable inbox. The webhook acknowledges after storage.
- `outbox_events` separates order settlement from customer notifications.
- `/api/cron/commerce-worker` leases inbox and outbox rows with `SKIP LOCKED`,
  retries with bounded exponential backoff, and dead-letters after ten attempts.
- Checkout return pages poll `/api/checkout/status` and never infer paid state
  from provider query parameters.

## Deployment contract

Production database changes are expand/contract:

1. Ship additive tables, columns, functions, and compatibility behavior.
2. Deploy the application and pass deep readiness checks.
3. Observe worker backlog, dead letters, payment-attempt ambiguity, and webhook age.
4. Remove obsolete schema only in a later migration.

`scripts/check-migration-safety.mjs` blocks destructive production migrations.
An intentional cleanup needs both the file marker
`-- deployment-safety: destructive-approved` and the protected environment
variable `ALLOW_DESTRUCTIVE_MIGRATIONS=true`.

## Product-only cutover verification

Before another production deployment, record evidence for migration
`20260722100000_remove_sku_model.sql`:

- the environments where it ran;
- the migration timestamps and operator/deployment run;
- row counts or backup evidence showing whether commercial data existed;
- the restore point retained before the cutover.

If production history cannot establish a disposable or empty environment, treat
the cutover as a data-loss incident and preserve all remaining backups and logs.

## Recovery drill

Run this in a production-shaped non-production environment:

1. Create a checkout and inject a provider timeout after HitPay accepts it.
2. Verify the payment attempt becomes `result_unknown` and inventory remains reserved.
3. Deliver the signed webhook twice and verify one inbox row and one settlement.
4. Fail notification delivery, verify the order remains paid, then replay the outbox event.
5. Hold a worker lease past expiry and verify another worker reclaims it.
6. Force ten failures and verify the row enters `dead_letter` without being deleted.
7. Restore the database backup and run the checkout contract suite.

Record timings, operator actions, lost/duplicated side effects, and follow-up work.
