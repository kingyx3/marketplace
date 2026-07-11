# Production-readiness audit — 2026-07-11

Repository: `kingyx3/marketplace`  
Audited base: `main` at `68a39dc6f5803114333369b691eaad9444e311e6`  
Remediation branch: `agent/production-readiness-audit`  
Draft pull request: #43

## Executive summary

The application is a Next.js 16 marketplace using Supabase PostgreSQL/Auth/RLS/Storage, Stripe PaymentIntents and signed webhooks, Resend, Vercel, Terraform, and GitHub Actions.

Progressive remediation closed the original commercial and deployment defects:

- paid checkout requires a validated Singapore shipping address, an active server-side shipping policy, a database-verified final total, and an immutable order snapshot;
- B2B invoice checkout requires reviewed NET terms, positive credit, a unique PO reference, serialized exposure checks, due/expiry deadlines, and authenticated inventory release;
- production catalog failures no longer display fixture inventory;
- partial-refund accounting, payment concurrency, preorder mutation, staff revocation, image allowlisting, webhook privacy, request correlation, and operational alerts are hardened;
- customer RLS policies are explicitly authenticated and include ownership update checks;
- dedicated staging and recovery infrastructure plus mandatory hosted release evidence are now part of the production dependency graph.

Shipping and invoice policies remain inactive by default. Production cannot deploy until the exact release commit passes the protected hosted release workflow.

## Updated scorecard

| Area | Score |
| --- | ---: |
| Customer frontend | 3.8 / 5 |
| Admin frontend | 3.3 / 5 |
| Backend and APIs | 4.0 / 5 |
| Database and migrations | 4.3 / 5 |
| Authentication and authorization | 4.0 / 5 |
| Security and privacy | 4.0 / 5 |
| Testing and quality assurance | 4.0 / 5 |
| Performance and scalability | 2.8 / 5 |
| Reliability and observability | 3.8 / 5 |
| CI/CD and deployment | 4.5 / 5 |
| Documentation and operational readiness | 4.0 / 5 |

**Updated repository-readiness score: 3.9 / 5.0**

The score reflects implemented and repository-verified controls. It does not assert that unavailable hosted resources have passed their external gates.

## Finding status

| Finding | Priority | Status |
| --- | --- | --- |
| PRD-001 shipping contract | P0 | Fixed; inactive until hosted staging activation succeeds. |
| PRD-002 B2B invoice credit/reservation | P0 | Fixed; inactive until hosted staging activation succeeds. |
| PRD-003 production fixture fallback | P1 | Fixed. |
| PRD-004 refund ledger | P1 | Fixed. |
| PRD-005 payment concurrency | P1 | Fixed. |
| PRD-006 unsafe preorder PATCH | P1 | Fixed fail-closed. |
| PRD-007 staff revocation | P1 | Fixed. |
| PRD-008 image allowlist | P1 | Fixed. |
| PRD-009 provider integration tests | P1 | Fixed as mandatory real hosted Supabase, OAuth, Stripe, webhook, refund, and delivered-email gates. |
| PRD-010 backup and restore | P1 | Fixed as mandatory production PITR, Storage recovery, and timed separate-project restore gates. |
| PRD-011 observability | P1 | Fixed as mandatory readiness, cron, correlation, alert-delivery, ownership, escalation, and SLO gates. |
| PRD-013 webhook payload retention | P2 | Fixed with a minimal event envelope. |

## Production release dependency graph

A release tag now performs these steps for the exact commit:

1. Deploy to a dedicated staging Vercel project and staging Supabase project.
2. Test real anonymous/customer RLS isolation and active/deactivated staff authorization.
3. Test Storage upload/download/public checksum recovery.
4. Test Google OAuth initialization and provider redirect.
5. Create and cancel a real Stripe test-mode SGD PayNow PaymentIntent.
6. Test signed webhook rejection, success, duplicate delivery, out-of-order failure safety, partial-refund replay, and full refund.
7. Confirm the order email reaches Resend's delivered state.
8. Test shallow/deep readiness, protected cron execution, request correlation, operational alert delivery, named ownership, escalation, and release SLO definitions.
9. Dump staging and clean-restore into a separate disposable recovery project, validate a recovery marker and critical commerce objects, and enforce the RTO.
10. Request production approval only after staging passes.
11. Verify production Supabase PITR retention and security/performance advisors.
12. Deploy production only after every dependency succeeds.

Missing credentials, missing projects, disabled PITR, blocking advisor findings, notification failure, alert failure, OAuth failure, recovery failure, or provider-state failure blocks production.

## Repository verification

Verified code and workflow head: `225cc9c59725397254b4e743e1c8420ce67058af`  
GitHub Actions run: `29148618099` — completed successfully.

Passed:

- dependency installation;
- lint;
- strict type checking;
- unit and contract tests;
- production build;
- Chromium Playwright;
- configuration and generated-environment contracts;
- Terraform bootstrap and platform validation;
- migrations and seed;
- transactional checkout and RLS database contracts;
- logical backup and isolated restore;
- release-workflow ordering and hosted-gate contracts.

## External evidence status

No Supabase projects are connected to this session, and hosted provider credentials are unavailable. The new staging/recovery/production gates therefore could not be executed here. This is represented honestly: the repository is configured to refuse production deployment until real hosted evidence exists.

No production data was modified, no production database was contacted, no secrets were exposed, and no existing migration was edited or reordered.

## Final decision

**REPOSITORY BLOCKERS FIXED — production remains fail-closed until the mandatory hosted release-gate workflow passes with real provider resources and protected production approval.**
