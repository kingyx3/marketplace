# Production-readiness audit — 2026-07-11

Repository: `kingyx3/marketplace`  
Audited base: `main` at `68a39dc6f5803114333369b691eaad9444e311e6`  
Remediation branch: `agent/production-readiness-audit`  
Draft pull request: #43

## Executive summary

The application is a Next.js 16 marketplace using Supabase PostgreSQL/Auth/RLS/storage, Stripe PaymentIntents and webhooks, Vercel, Terraform, and GitHub Actions.

Progressive remediation closed the original P0 defects:

- order checkout now requires a validated Singapore shipping address, active database shipping policy, server-calculated rate, immutable order snapshot, and matching Stripe total;
- B2B invoice checkout now requires reviewed NET terms, positive credit limit, unique PO reference, serialized exposure checks, due/expiry deadlines, and authenticated hourly allocation release;
- production catalog failures no longer display fixture inventory.

The branch also fixes refund accounting, payment concurrency, unsafe preorder mutation, staff revocation, product-image configuration, dependency incompatibilities, full Stripe webhook payload retention, and missing request correlation.

Shipping and invoice policies are inactive by default. The application must not be deployed until hosted Supabase/Stripe testing, production backup/PITR, production observability/alerts, and staging rehearsal are demonstrated.

## Updated scorecard

| Area | Score |
| --- | ---: |
| Customer frontend | 3.5 / 5 |
| Admin frontend | 3.0 / 5 |
| Backend and APIs | 3.5 / 5 |
| Database and migrations | 4.0 / 5 |
| Authentication and authorization | 3.5 / 5 |
| Security and privacy | 3.5 / 5 |
| Testing and quality assurance | 3.5 / 5 |
| Performance and scalability | 2.5 / 5 |
| Reliability and observability | 3.0 / 5 |
| CI/CD and deployment | 4.0 / 5 |
| Documentation and operational readiness | 3.5 / 5 |

**Updated overall score: 3.5 / 5.0**

## Finding status

| Finding | Priority | Status |
| --- | --- | --- |
| PRD-001 shipping contract | P0 | Fixed in code; inactive until staging activation. |
| PRD-002 B2B invoice credit/reservation | P0 | Fixed in code; inactive until cron/account/staging activation. |
| PRD-003 production fixture fallback | P1 | Fixed. |
| PRD-004 refund ledger | P1 | Fixed. |
| PRD-005 payment concurrency | P1 | Fixed. |
| PRD-006 unsafe preorder PATCH | P1 | Fixed fail-closed. |
| PRD-007 staff revocation | P1 | Fixed. |
| PRD-008 image allowlist | P1 | Fixed. |
| PRD-009 provider integration tests | P1 | PostgreSQL contracts added; hosted Supabase/Stripe tests remain. |
| PRD-010 backup and restore | P1 | Logical restore passes; provider PITR/storage/timed drill remain. |
| PRD-011 observability | P1 | Correlation/runbooks added; production ingestion/alerts remain. |
| PRD-013 webhook payload retention | P2 | Fixed with minimal event envelope. |

## Verification

Verified code head: `16375359bb62cf83aba0f6b36cf65003313bede0`  
GitHub Actions run: `29146715422` — completed successfully.

Passed:

- dependency installation;
- lint;
- strict type checking;
- unit/contract tests;
- production build;
- Chromium Playwright;
- configuration contracts;
- both Terraform validations;
- migrations and seed;
- transactional checkout database contracts;
- logical backup and isolated restore.

## Remaining deployment gates

- Hosted Supabase Auth/RLS tests with real role identities.
- Stripe test-mode PayNow, signed webhook retry/order, refund, and outage tests.
- Production Supabase PITR/retention, product-image recovery, and timed restore drill.
- Production log ingestion, dashboards, alerts, SLOs, and on-call ownership.
- Production-like staging for OAuth, Stripe, Supabase, Vercel Cron, and notifications.
- Accessibility, Firefox/WebKit, load, and production-capacity testing.

No production data was modified, no production database was contacted, no secrets were exposed, and no existing migration was edited or reordered.

CONDITIONALLY READY — no unresolved P0 findings remain, but documented P1 provider, backup, observability, staging, and operational prerequisites must be completed before deployment.
