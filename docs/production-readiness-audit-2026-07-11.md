# Production-readiness audit — 2026-07-11

Repository: `kingyx3/marketplace`  
Audited base: `main` at `68a39dc6f5803114333369b691eaad9444e311e6`  
Remediation branch: `agent/production-readiness-audit`  
Draft pull request: #43

> **Progressive remediation update:** The original P0 shipping and B2B invoice defects have been fixed with fail-closed defaults. Production fixture fallback has also been removed. See `docs/production-readiness-remediation-progress-2026-07-11.md` and `docs/production-readiness-verification-2026-07-11.md` for the current implementation and verification evidence. The original findings below are retained as the audit record; their current status is superseded by the remediation progress document.

## 1. Executive summary

### Architecture

The repository is a single Next.js 16 application deployed to Vercel. It contains the customer storefront, authenticated account area, admin/operator interface, route-handler APIs, and server actions. Supabase supplies PostgreSQL, Auth, Row-Level Security, and public product-image storage. Stripe PaymentIntents provide SGD PayNow payments and signed webhooks. Terraform provisions Vercel and separate development/production Supabase projects. GitHub Actions validates application code, SQL migrations, environment contracts, Terraform, provider configuration, deployment, and shallow/deep health checks.

The repository is substantially more mature than a prototype: prices are recalculated server-side, checkout inventory changes use database functions, customer reads are scoped by customer ID and RLS, admin writes are routed through service-role code and explicit RPCs, webhook signatures are verified, deployments are declarative, and there is meaningful unit/contract coverage.

### Current readiness level

The original audit identified two P0 commerce gaps and several P1 operational gaps. Progressive remediation has now closed the P0 code defects:

1. Order checkout requires a validated shipping address, active database shipping policy, server-calculated rate, immutable order snapshot, and matching Stripe total. The current tax contract is intentionally restricted to Singapore.
2. B2B manual-invoice checkout requires reviewed NET terms, a positive credit limit, a unique PO reference, serialized exposure checks, payment and allocation deadlines, and authenticated hourly expiry/release.
3. Production storefront failures no longer fall back to fixture products.
4. CI now executes transactional PostgreSQL checkout contracts and a logical dump/isolated restore test.
5. Critical routes emit structured privacy-safe logs and correlated request IDs; full Stripe webhook payload retention has been removed.

The application remains gated from production deployment because hosted Supabase Auth/RLS, Stripe test-mode flows, production backup/PITR, production log ingestion/alerts, and a production-like staging rehearsal have not been demonstrated.

### Serious risks corrected in this branch

The remediation branch corrects:

- Partial Stripe refund ledger overstatement.
- Unserialized order payment transitions and weak provider-reference binding.
- Generic preorder lifecycle mutation bypass.
- Admin API access surviving staff deactivation.
- Missing external product-image allowlist.
- Paid order checkout without shipping address/rate/snapshot.
- B2B invoice inventory reservation without credit/exposure/expiry controls.
- Production catalog fixture fallback.
- Unsupported TypeScript and ESLint dependency selections.
- Full Stripe webhook payload retention.
- Missing request correlation and structured critical-path logging.

### Deployment decision

Do not deploy for real customer orders until the remaining P1 hosted-provider and operational prerequisites are completed. Shipping and B2B invoice policies remain inactive by default and must not be enabled until their documented staging and operational gates pass.

## 2. Production-readiness scorecard

Scores are 0–5. A score describes verified repository readiness, not intended design.

| Area | Updated score | Evidence and rationale |
| --- | ---: | --- |
| Customer frontend | 3.5 | Shipping address and final server total are now integrated; production fixtures fail closed. Hosted authenticated/payment journeys and broader browser/accessibility verification remain. |
| Admin frontend | 3.0 | Active-staff guards, audited operations, and a dedicated B2B credit/policy page exist. Pagination, bulk tooling, role granularity, and production operator testing remain limited. |
| Backend and APIs | 3.5 | Server pricing, shipping policy, B2B credit exposure, idempotency, signatures, correlation, and named transitions are implemented. Rate limits, durable queues, and provider-backed failure tests remain. |
| Database and migrations | 4.0 | Strong constraints/RLS/transactions plus executable shipping, credit, expiry, payment, and logical-restore tests. Hosted RLS, PITR, production-sized restore timing, and representative query/load testing remain. |
| Authentication and authorization | 3.5 | Active staff is authoritative and object access is scoped. Hosted session, revocation, OAuth, and RLS identities remain unverified. |
| Security and privacy | 3.5 | Fail-closed policies, redacted structured logs, minimal webhook envelope, service-role separation, RLS, and security headers are present. Abuse controls, fuller CSP, privacy lifecycle, and automated security analysis remain. |
| Testing and quality assurance | 3.5 | All repository gates pass; CI now includes transactional SQL contracts and logical restore. Real Supabase/Stripe identities/providers, accessibility, Firefox/WebKit, and load tests remain. |
| Performance and scalability | 2.5 | Bounded requests and database transitions are present, but no measured load/query/bundle budgets or production-capacity tests exist. |
| Reliability and observability | 3.0 | Health checks, structured correlation, cron cleanup, logical restore, and runbooks exist. External ingestion, metrics, dashboards, paging, and on-call proof remain. |
| CI/CD and deployment | 4.0 | Reproducible install, full checks, SQL contracts, restore verification, Terraform validation, environment contracts, and immutable deploy mechanics are strong. Staging, hosted provider tests, production backup gates, and security scanning remain. |
| Documentation and operational readiness | 3.5 | Deployment, security, recovery, observability, remediation, and operator docs exist. Live provider evidence, SLO ownership, privacy procedures, and completed incident drills remain. |

**Updated overall score: 3.5 / 5.0**

## 3. Findings register

The complete original 22-finding register is preserved in the repository history and remediation progress documentation. Current statuses for the highest-priority findings are:

| Finding | Priority | Current status |
| --- | --- | --- |
| PRD-001 shipping contract | P0 | Fixed in code; policy activation gated and Singapore-only. |
| PRD-002 B2B invoice credit/reservation | P0 | Fixed in code; global policy inactive until cron/account configuration and staging verification. |
| PRD-003 production fixture fallback | P1 | Fixed. |
| PRD-004 refund ledger overstatement | P1 | Fixed with regression coverage. |
| PRD-005 payment transition concurrency | P1 | Fixed with migration and database contract coverage. |
| PRD-006 unsafe preorder PATCH | P1 | Fixed fail-closed. |
| PRD-007 stale metadata admin access | P1 | Fixed; active staff record required. |
| PRD-008 external image host | P1 | Fixed with narrow Supabase storage allowlist. |
| PRD-009 provider-backed integration testing | P1 | Partially fixed; PostgreSQL contracts added, hosted Supabase/Stripe tests remain. |
| PRD-010 backup and restore | P1 | Partially fixed; logical restore passes, provider PITR/storage/timed drill remain. |
| PRD-011 observability | P1 | Partially fixed; structured correlation/runbooks added, production ingestion/alerts remain. |
| PRD-013 full webhook payload retention | P2 | Fixed with minimal envelope. |

See `docs/production-readiness-remediation-progress-2026-07-11.md` for detailed evidence and activation prerequisites.

## 4. Changes made

The branch includes bounded fixes across payment/refund accounting, shipping, invoice credit, authorization, catalog failure handling, database functions, scheduled cleanup, environment contracts, observability, recovery, tests, and documentation.

Key forward migrations:

- `20260711000000_lock_order_payment_transition.sql`
- `20260711010000_shipping_checkout_contract.sql`
- `20260711020000_b2b_invoice_credit_controls.sql`
- `20260711021000_harden_invoice_expiry_payment_state.sql`
- `20260711022000_restrict_shipping_tax_scope.sql`

No production data was modified. No production database was contacted. No secrets were read, printed, or committed. No existing migration was edited or reordered.

## 5. Verification evidence

Verified code head: `16375359bb62cf83aba0f6b36cf65003313bede0`  
GitHub Actions run: `29146715422` — completed successfully.

Passed:

- dependency installation (`npm ci`);
- lint;
- strict type check;
- Vitest unit/contract suite;
- production build;
- Chromium Playwright suite;
- configuration contracts;
- Terraform bootstrap and platform validation;
- all migrations and seed;
- transactional PostgreSQL checkout contracts;
- custom-format logical dump and isolated restore verification.

The successful repository run is not evidence that hosted Supabase, Stripe, Vercel Cron, production backups, production alerts, or production-scale behavior have passed.

## 6. Deployment checklist

Before enabling production orders:

- [ ] Provision and verify all production environment variables, including `CRON_SECRET`.
- [ ] Apply migrations through the reviewed deployment path.
- [ ] Configure `shipping_policy` for Singapore/SGD with the approved service/rate; keep inactive until staging passes.
- [ ] Configure reviewed account NET terms and credit limits.
- [ ] Verify two successful hourly invoice-expiry cron runs before enabling `b2b_invoice_policy`.
- [ ] Execute hosted Supabase Auth/RLS tests for anon, customer, active staff, and deactivated staff.
- [ ] Execute real Stripe test-mode PayNow, webhook duplicate/retry/out-of-order, refund, cancellation, and outage tests.
- [ ] Confirm Supabase PITR/backup retention and product-image recovery.
- [ ] Complete and record a timed isolated production-shaped restore drill.
- [ ] Connect structured logs to the approved provider and verify dashboards, alerts, escalation, and retention.
- [ ] Complete production-like staging OAuth, Stripe, Supabase, Vercel Cron, notification, and smoke tests.
- [ ] Verify TLS/HSTS, cookies, CSP, headers, domain, callbacks, and webhook URLs on the deployed environment.
- [ ] Record immutable rollback target and forward-revert SQL ownership.

## 7. Residual risks and unverified areas

Not treated as passing:

- hosted Supabase Auth/RLS and session behavior;
- real Stripe/PayNow and provider failure/retry behavior;
- managed production PITR/retention and object-storage recovery;
- production log ingestion, alerts, SLOs, and on-call execution;
- production-like staging rehearsal;
- accessibility and Firefox/WebKit release gates;
- load, capacity, and production-sized restore timing;
- legal/privacy/tax requirements beyond the intentionally restricted Singapore checkout scope.

## 8. Pull request

Draft PR #43 contains the progressive remediation, executable evidence, deployment prerequisites, and rollback considerations. It should remain a draft until the hosted P1 prerequisites are demonstrated and attached to the PR.

## Final decision

CONDITIONALLY READY — no unresolved P0 findings remain, but documented P1 provider, backup, observability, staging, and operational prerequisites must be completed before deployment.
