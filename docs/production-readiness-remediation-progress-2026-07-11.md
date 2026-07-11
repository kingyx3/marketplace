# Production-readiness remediation progress — 2026-07-11

This document updates the original audit after progressive remediation on `agent/production-readiness-audit`.

## Status summary

| Original finding | Current status | Evidence |
| --- | --- | --- |
| PRD-001 paid orders omit shipping contract | Fixed in code; activation gated | Address required, server-side policy/rate validation, order address/service snapshot, shipping included in Stripe amount and final UI total, old RPC fails closed. Shipping policy is inactive by default. |
| PRD-002 manual invoices lack credit controls | Fixed in code; activation gated | Account row locking, approved NET terms, positive credit limit, serialized exposure check, required unique PO reference, due date, reservation expiry, hourly authenticated cleanup, operator configuration page. Policy is inactive by default. |
| PRD-003 production catalog can show fixtures | Fixed | Production targets ignore fixture flags and show an unavailable state. Fixture data is limited to development and explicit E2E execution. |
| PRD-009 critical provider/authorization behavior not integration-tested | Partially remediated | CI now executes transactional PostgreSQL checkout contracts after migrations and seed. Hosted Supabase Auth/RLS and real Stripe test-mode flows still require a staging environment. |
| PRD-010 backup/restore not evidenced | Partially remediated | CI performs a custom-format logical dump and isolated restore validation. Managed Supabase PITR, retention, production-sized restore timing, and storage recovery still require provider-side verification. |
| PRD-011 observability incomplete | Partially remediated | Critical paths emit structured privacy-safe JSON logs with request IDs and correlated response headers. Production ingestion, dashboards, alert routing, and on-call ownership remain deployment prerequisites. |
| PRD-013 full Stripe payload retained | Fixed | Webhook idempotency records retain a minimal event envelope without the customer/payment object. |

## Shipping production contract

Order checkout now requires:

- recipient name;
- address line 1;
- postal code;
- ISO country code;
- an active `shipping_policy` database record;
- supported currency and destination;
- a server-calculated rate that matches the database transaction.

The database independently recalculates and validates the shipping rate and expected total before inventory allocation succeeds. The delivery address, shipping service, policy key, tax amount, and final total are snapshotted on the order. Stripe receives the same final amount and shipping address.

The current tax contract is Singapore GST-inclusive. Checkout and the database therefore reject non-Singapore shipping until a jurisdiction-aware tax implementation is introduced.

### Activation prerequisites

- Configure `shipping_policy` with Singapore only, SGD, approved flat rate, optional free-shipping threshold, and real service name.
- Test a low-value Stripe order in staging and verify the order snapshot, Stripe amount, tax display, inventory allocation, notification, and refund path.
- Keep the policy inactive if no approved delivery service/rate exists.

## B2B invoice production contract

Invoice checkout now requires:

- approved B2B account and assigned wholesale pricing tier;
- reviewed `NET1`–`NET90` terms;
- positive account credit limit;
- active global `b2b_invoice_policy`;
- payment terms no longer than the policy maximum;
- a required, unique per-customer PO/invoice reference;
- total unexpired pending invoice exposure plus the new order not exceeding the credit limit;
- validated shipping address and shipping total.

The account row is locked while exposure is checked and the order is created, preventing concurrent requests from independently consuming the same credit headroom. Each invoice receives a payment deadline and a shorter or equal inventory-reservation deadline.

An authenticated hourly Vercel Cron calls `expire_stale_invoice_orders`, which releases inventory, cancels the pending invoice payment placeholder and order, and writes an audit record.

### Activation prerequisites

- Provision `CRON_SECRET` in the production GitHub Environment and Vercel runtime.
- Confirm Vercel Cron invokes `/api/cron/invoice-expiry` and that a completion log is received for two consecutive intervals.
- Configure reviewed account credit terms through `/admin/wholesale/credit`.
- Enable `b2b_invoice_policy` only after cron verification.
- Test duplicate PO, over-credit concurrent requests, expiry, reconciliation, and paid invoice handling in staging.

## Database integration and recovery evidence

The migration CI job now:

1. applies the auth shim;
2. applies every migration in filename order;
3. applies the seed;
4. executes transactional checkout SQL assertions;
5. creates a custom-format logical dump;
6. restores into a separate PostgreSQL database;
7. validates critical tables, checkout functions, policy rows, and seeded catalog data.

The SQL assertions cover:

- legacy no-address checkout failing closed;
- shipping address/rate/tax snapshot;
- unique PO references;
- transactional invoice exposure rejection;
- payment and allocation deadlines;
- automatic invoice cancellation and inventory release.

## Observability evidence

Critical routes now return `x-request-id` and emit structured events for:

- payment checkout creation and rejection;
- manual-invoice creation and rejection;
- Stripe webhook signature, duplicate, storage, processing, and success outcomes;
- invoice-expiry cron authorization, failure, and completion;
- B2B credit administration;
- unhandled API errors and validation failures.

Sensitive log keys are recursively redacted. Raw request bodies, customer contact details, credentials, Stripe objects, and webhook payloads must not be added to log context.

See `docs/observability.md` and `docs/backup-restore.md` for deployment and incident procedures.

## Remaining launch-blocking P1 prerequisites

The following remain unverified and must not be treated as passing:

1. Hosted Supabase RLS and Auth tests with real anon, customer, active-staff, and deactivated-staff identities.
2. Real Stripe test-mode PayNow, signed webhook retry/duplicate/out-of-order behavior, partial/full refund reconciliation, and provider outage tests.
3. Production Supabase backup/PITR configuration, retention evidence, storage recovery, and a timed isolated restoration drill.
4. Production log ingestion, dashboards, alert delivery, SLOs, and on-call/incident ownership.
5. Staging environment with production-like OAuth, Stripe, Supabase, Vercel, cron, and notification configuration.

## Current readiness interpretation

The original P0 workflow defects are closed with fail-closed defaults. The application still must not be launched until the remaining P1 operational and provider-backed prerequisites are demonstrated. Passing repository CI verifies code, migrations, logical restoration, and preview browser behavior; it does not prove the hosted production system.
