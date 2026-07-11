# Production-readiness remediation progress — 2026-07-11

This document updates the original audit after progressive remediation on `agent/production-readiness-audit`.

## Status summary

| Original finding | Current status | Evidence |
| --- | --- | --- |
| PRD-001 paid orders omit shipping contract | Fixed in code; activation gated | Address required, server-side policy/rate validation, order address/service snapshot, shipping included in Stripe amount and final UI total, old RPC fails closed. Shipping policy is inactive by default. |
| PRD-002 manual invoices lack credit controls | Fixed in code; activation gated | Account row locking, approved NET terms, positive credit limit, serialized exposure check, required unique PO reference, due date, reservation expiry, hourly authenticated cleanup, operator configuration page. Policy is inactive by default. |
| PRD-003 production catalog can show fixtures | Fixed | Production targets ignore fixture flags and show an unavailable state. Fixture data is limited to development and explicit E2E execution. |
| PRD-004 refund ledger overstatement | Fixed | Individual Stripe refund amount and provider refund ID are stored; partial-refund regression passes. |
| PRD-005 payment transition concurrency | Fixed | Order row locking, amount/currency validation, and payment-reference ownership enforced. |
| PRD-006 unsafe generic preorder mutation | Fixed | Generic status PATCH is disabled; named guarded workflows remain. |
| PRD-007 staff deactivation not authoritative | Fixed | Active `staff_users` record is required for admin APIs. |
| PRD-008 product image host not configured | Fixed | Next Image permits only the configured Supabase public storage path. |
| PRD-009 critical provider/authorization behavior not integration-tested | Partially remediated | CI now executes transactional PostgreSQL checkout contracts after migrations and seed. Hosted Supabase Auth/RLS and real Stripe test-mode flows still require staging. |
| PRD-010 backup/restore not evidenced | Partially remediated | CI performs a custom-format logical dump and isolated restore validation. Managed Supabase PITR, retention, production-sized restore timing, and storage recovery still require provider-side verification. |
| PRD-011 observability incomplete | Partially remediated | Critical paths emit structured privacy-safe JSON logs with request IDs and correlated response headers. Production ingestion, dashboards, alert routing, and on-call ownership remain deployment prerequisites. |
| PRD-013 full Stripe payload retained | Fixed | Webhook idempotency records retain a minimal event envelope without the customer/payment object. |

## Shipping production contract

Order checkout now requires a validated Singapore delivery address, an active `shipping_policy`, a server-calculated SGD rate, and a matching database/Stripe total. The database snapshots the address, service, policy key, shipping amount, GST-inclusive tax amount, and final total. Non-Singapore checkout is rejected until jurisdiction-aware tax calculation exists.

### Activation prerequisites

- Configure `shipping_policy` for Singapore/SGD with the approved service and rate.
- Complete a low-value staging Stripe order, notification, refund, and inventory reconciliation.
- Keep the policy inactive until the staging evidence is attached to the PR.

## B2B invoice production contract

Invoice checkout now requires an approved B2B account, assigned wholesale tier, reviewed NET terms, positive credit limit, active global policy, unique PO reference, serialized exposure headroom, validated shipping, and payment/allocation deadlines. An authenticated hourly cron releases stale allocations and cancels the pending invoice order/payment with an audit record.

### Activation prerequisites

- Provision `CRON_SECRET` in GitHub Environment and Vercel.
- Verify two consecutive hourly cron executions.
- Configure reviewed terms and credit limits through `/admin/wholesale/credit`.
- Enable `b2b_invoice_policy` only after duplicate-PO, concurrent over-credit, expiry, reconciliation, and paid-invoice staging tests pass.

## Database, recovery, observability, and privacy evidence

CI applies migrations and seed, runs transactional checkout SQL assertions, creates a custom logical dump, restores it into a separate database, and validates critical commerce objects. Critical routes return `x-request-id` and emit structured redacted events. Stripe webhook idempotency storage retains a minimal envelope rather than the full customer/payment payload.

## Final repository verification

Verified code head: `16375359bb62cf83aba0f6b36cf65003313bede0`  
GitHub Actions run: `29146715422` — completed successfully.

Passed: dependency installation, lint, strict type checking, unit/contract tests, production build, Chromium Playwright, configuration contracts, both Terraform validations, migrations and seed, transactional database contracts, and logical backup/isolated restore.

## Remaining launch-blocking P1 prerequisites

1. Hosted Supabase RLS/Auth tests with real anon, customer, active-staff, and deactivated-staff identities.
2. Real Stripe test-mode PayNow, signed webhook retry/duplicate/out-of-order, refund reconciliation, and outage tests.
3. Production Supabase backup/PITR retention, product-image recovery, and a timed production-shaped restore drill.
4. Production log ingestion, dashboards, alert delivery, SLOs, and on-call/incident ownership.
5. Production-like staging for OAuth, Stripe, Supabase, Vercel Cron, and notifications.

The P0 workflow defects are closed with fail-closed defaults. Shipping and invoice policies remain inactive until operators configure and verify them. The application must not be deployed until the remaining P1 prerequisites are demonstrated.

CONDITIONALLY READY — no unresolved P0 findings remain, but documented P1 provider, backup, observability, staging, and operational prerequisites must be completed before deployment.
