# Production-readiness remediation progress — 2026-07-11

## Fixed findings

| Finding | Status |
| --- | --- |
| PRD-001 shipping contract | Fixed in code; inactive policy until staging activation. |
| PRD-002 B2B invoice credit/reservation | Fixed in code; inactive policy until cron/account/staging activation. |
| PRD-003 production fixture fallback | Fixed; production fails closed. |
| PRD-004 refund ledger overstatement | Fixed. |
| PRD-005 payment transition concurrency | Fixed. |
| PRD-006 unsafe preorder mutation | Fixed fail-closed. |
| PRD-007 staff deactivation authority | Fixed. |
| PRD-008 product image allowlist | Fixed. |
| PRD-013 full webhook payload retention | Fixed with minimal event envelope. |

## Partially remediated P1 findings

| Finding | Repository improvement | Remaining hosted evidence |
| --- | --- | --- |
| PRD-009 provider integration tests | Transactional PostgreSQL checkout suite added. | Real Supabase Auth/RLS and Stripe test-mode flows. |
| PRD-010 backup/restore | Logical dump and isolated restore pass in CI. | Supabase PITR/retention, storage recovery, timed production-shaped drill. |
| PRD-011 observability | Structured redacted logs, request IDs, critical events, and runbook. | Production ingestion, dashboards, alerts, SLOs, and on-call proof. |

## Shipping contract

Checkout requires a validated Singapore address, active database shipping policy, server-calculated SGD rate, database/Stripe total agreement, and an immutable order snapshot. Non-Singapore checkout is rejected until jurisdiction-aware tax calculation exists.

`shipping_policy` remains inactive by default. Configure and test it in staging before enabling production orders.

## B2B invoice contract

Invoice checkout requires approved B2B status, assigned pricing, reviewed NET terms, positive credit limit, active global policy, unique PO reference, serialized exposure headroom, validated shipping, and payment/allocation deadlines. An authenticated hourly cron releases expired inventory and cancels stale invoice orders/payments.

`b2b_invoice_policy` remains inactive by default. Provision `CRON_SECRET`, verify two scheduled runs, configure account terms, and complete staging tests before enabling it.

## Verification

Verified code head: `16375359bb62cf83aba0f6b36cf65003313bede0`  
GitHub Actions run: `29146715422` — completed successfully.

Passed: installation, lint, strict type check, unit/contract tests, production build, Chromium Playwright, configuration contracts, both Terraform validations, migrations and seed, transactional database tests, and logical backup/isolated restore.

## Remaining deployment gates

1. Hosted Supabase RLS/Auth tests with real role identities.
2. Stripe test-mode PayNow, signed webhook retry/order, refund, and outage tests.
3. Production PITR/retention, image recovery, and timed restore drill.
4. Production log ingestion, dashboards, alerts, SLOs, and on-call ownership.
5. Production-like staging for OAuth, Stripe, Supabase, Vercel Cron, and notifications.

CONDITIONALLY READY — no unresolved P0 findings remain, but documented P1 provider, backup, observability, staging, and operational prerequisites must be completed before deployment.
