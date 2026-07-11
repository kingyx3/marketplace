# Production-readiness remediation progress — 2026-07-11

## Fixed findings

| Finding | Status |
| --- | --- |
| PRD-001 shipping contract | Fixed in code; inactive policy until staged activation. |
| PRD-002 B2B invoice credit/reservation | Fixed in code; inactive policy until staged activation. |
| PRD-003 production fixture fallback | Fixed; production fails closed. |
| PRD-004 refund ledger overstatement | Fixed. |
| PRD-005 payment transition concurrency | Fixed. |
| PRD-006 unsafe preorder mutation | Fixed fail-closed. |
| PRD-007 staff deactivation authority | Fixed. |
| PRD-008 product image allowlist | Fixed. |
| PRD-009 provider integration coverage | Fixed as a mandatory hosted release gate. |
| PRD-010 backup and restore evidence | Fixed as mandatory PITR, Storage recovery, and timed restore gates. |
| PRD-011 observability and ownership | Fixed as mandatory alert-delivery, SLO, correlation, cron, and owner gates. |
| PRD-013 full webhook payload retention | Fixed with a minimal event envelope. |

## Shipping and invoice contracts

Checkout requires a validated Singapore address, an active database shipping policy, a server-calculated SGD rate, database/Stripe total agreement, and an immutable order snapshot. Non-Singapore checkout is rejected until jurisdiction-aware tax calculation exists.

Invoice checkout requires approved B2B status, assigned pricing, reviewed NET terms, a positive credit limit, an active global policy, a unique PO reference, serialized exposure headroom, validated shipping, and payment/allocation deadlines. An authenticated hourly cron releases expired inventory and cancels stale invoice orders and payments.

Both commercial policies remain inactive by default. They cannot be safely activated until the hosted release workflow passes.

## Mandatory hosted release path

Production release now executes this dependency chain for the exact release commit:

1. Deploy the commit to a dedicated staging Vercel project and staging Supabase project.
2. Verify real anonymous/customer RLS isolation and active/deactivated staff authorization.
3. Verify Supabase Storage upload, download, public delivery, and checksum recovery.
4. Verify Google OAuth initialization and redirect to the configured Google provider.
5. Verify a real Stripe test-mode SGD PayNow PaymentIntent.
6. Verify signed Stripe webhook rejection, success, duplicate handling, out-of-order failure safety, partial refund idempotency, and full refund transitions.
7. Verify the paid-order notification is accepted by Resend and reaches its delivered state.
8. Verify shallow/deep readiness, cron authentication, request correlation, alert delivery, named operational ownership, and release SLO values.
9. Create a logical staging backup, clean-restore it into a separate disposable recovery project, validate the recovered marker and critical commerce objects, and enforce the configured RTO.
10. After staging passes, request production approval and verify the production Supabase PITR retention window plus security/performance advisors.
11. Deploy production only after every preceding job succeeds.

The hosted evidence logs are retained as workflow artifacts. Missing credentials, projects, provider configuration, recovery capacity, alert destination, ownership, or SLO values cause the workflow to fail closed.

## Dedicated infrastructure and governance

Terraform now models separate development, staging, recovery, and production Supabase projects plus a dedicated staging Vercel project. GitHub bootstrap tooling manages protected staging and production environments, required deployment branch policies, provider credentials, recovery URLs, alert secrets, operational ownership, and SLO variables.

Production approval is requested only after the staging identity, payment, notification, operations, and restore job has passed. The production project is never used as the destructive restore target.

## Verification interpretation

Repository CI validates application code, workflow syntax/contracts, Terraform, migrations, transactional database behavior, local logical restore, build, and browser navigation. Hosted release gates validate the external systems and cannot be claimed as passed until they run with real staging, recovery, Stripe, Resend, alert, and Supabase credentials.

**Repository-side deployment blockers are fixed. Production remains intentionally blocked until the mandatory hosted release-gate workflow completes successfully.**
