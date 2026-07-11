# Production-readiness audit — 2026-07-11

Repository: `kingyx3/marketplace`  
Audited base: `main` at `68a39dc6f5803114333369b691eaad9444e311e6`  
Remediation branch: `agent/production-readiness-audit`  
Draft pull request: #43

## 1. Executive summary

### Architecture

The repository is a single Next.js 16 application deployed to Vercel. It contains the customer storefront, authenticated account area, admin/operator interface, route-handler APIs, and server actions. Supabase supplies PostgreSQL, Auth, Row-Level Security, and public product-image storage. Stripe PaymentIntents provide SGD PayNow payments and signed webhooks. Terraform provisions Vercel and separate development/production Supabase projects. GitHub Actions validates application code, SQL migrations, environment contracts, Terraform, provider configuration, deployment, and shallow/deep health checks.

The repository is substantially more mature than a prototype: prices are recalculated server-side, checkout inventory changes use database functions, customer reads are scoped by customer ID and RLS, admin writes are routed through service-role code and explicit RPCs, webhook signatures are verified, deployments are declarative, and there is meaningful unit/contract coverage.

### Current readiness level

The application is **not ready for production launch**. A successful build would not resolve the remaining business and operational gates:

1. Paid checkout is active while shipping address capture and shipping-rate calculation are not implemented. The UI explicitly says shipping will be calculated “after launch,” but the backend creates and charges an order with `shipping_cents = 0`.
2. Approved B2B users can reserve inventory through manual-invoice checkout without credit-limit, payment-term, outstanding-exposure, approval, or expiry enforcement.
3. Production storefront failures can fall back to fixture products, prices, and inventory rather than failing closed.
4. The highest-risk boundaries have mock/contract tests but no provider-backed Supabase RLS, authenticated browser, or Stripe integration tests.
5. The repository provides no evidence of production backup configuration, restoration testing, structured observability, paging/alerts, or an incident runbook.

### Serious risks corrected in this branch

The remediation branch safely corrects the following defects:

- Partial Stripe refunds were recorded using the charge’s cumulative refunded amount, overstating the internal refund ledger after multiple partial refunds.
- `mark_order_paid` did not lock the order row and did not reject reuse of a provider payment reference belonging to another record.
- A generic admin preorder PATCH directly changed lifecycle status and allocation quantity with the service role, bypassing inventory/payment state machines.
- API admin access could survive staff deactivation through stale `app_metadata` roles.
- Next Image had no allowlist for the external Supabase product-image origin.

### Deployment decision

Do not deploy the current application for real customer orders. At minimum, complete and verify the P0/P1 items listed below: shipping/address/tax contract, B2B credit policy and reservation expiry, production fixture fail-closed behavior, provider-backed critical-path tests, backup/restore readiness, and production observability.

## 2. Production-readiness scorecard

Scores are 0–5. A score describes verified repository readiness, not intended design.

| Area | Score | Evidence and rationale |
| --- | ---: | --- |
| Customer frontend | 2.0 | Responsive semantic UI and recoverable states exist, but shipping is explicitly unfinished, production may display fixtures on a data outage, account self-service is limited, and critical authenticated/payment journeys are not browser-tested. |
| Admin frontend | 2.5 | Active-staff page guards, audited RPCs, inventory/catalog/order/B2B workflows exist. The surface is a large operator page with limited pagination/bulk tooling, little destructive-action confirmation, and no production-like operator test. The unsafe generic preorder PATCH is disabled in this branch. |
| Backend and APIs | 2.5 | Server-derived pricing, bounded schemas, bearer verification, object scoping, webhook signatures, and explicit actions are good. Missing rate limits, request-size limits, provider timeouts, queues, invoice-credit enforcement, and allocation-expiry automation remain material. |
| Database and migrations | 3.0 | Strong use of FKs, unique/check constraints, RLS, cents, UTC timestamps, indexes, and transactional functions. Payment serialization is hardened in this branch. Restore testing, retention/anonymization, production-data migration rehearsal, and several operational state machines remain incomplete. |
| Authentication and authorization | 3.5 | OAuth redirects are pinned and sanitized; customer/API tokens are server-verified; customer object access is scoped; page/admin guards use active staff. This branch makes active `staff_users` authoritative for admin APIs. Session revocation and hosted RLS behavior are not integration-tested. |
| Security and privacy | 2.5 | Secrets are separated, service-role use is server-only, RLS is broadly enabled, clickjacking/MIME/referrer protections exist, and Stripe signatures are checked. Missing abuse controls, narrow CSP, full webhook-payload retention, no data-subject lifecycle, and no automated SCA/static security scan reduce confidence. |
| Testing and quality assurance | 2.5 | Lint, strict TypeScript, Vitest, build, SQL migration application, and Playwright are wired. Playwright tests only Chromium and preview fixtures; local Supabase/RLS, real authenticated sessions, Stripe flows, accessibility, and failure/recovery tests are absent. |
| Performance and scalability | 2.5 | Server rendering, Next Image, bounded API list limits, and Supabase HTTP clients are reasonable. Catalog queries are duplicated, there is no measured bundle/query budget, no load test, no cache strategy for catalog data, and operational list queries have hard limits rather than pagination. |
| Reliability and observability | 1.5 | Shallow/deep health checks and deploy smoke tests exist. There is no structured logger, correlation ID, metrics, tracing, error tracking, alerting, background queue/DLQ, tested backup restore, or automated stale-reservation recovery. |
| CI/CD and deployment | 3.5 | Reproducible `npm ci`, lockfiles, migration validation, Terraform drift gates, environment contracts, immutable Vercel deployment reuse, and rollback documentation are strong. Security scanning, verified branch protection, staging, pre-migration backup, and production commerce smoke tests are not evidenced. |
| Documentation and operational readiness | 3.0 | README, security, testing, deployment, provisioning, data-model, and admin-operation documents are useful. Backup/restore, incident response, privacy/retention, support escalation, SLOs, and end-to-end launch runbooks are missing. |

**Overall: 2.6 / 5.0**

## 3. Findings register

### PRD-001 — Paid orders omit the shipping contract

- **Priority / severity:** P0 / Critical
- **Affected component:** Customer checkout, order creation, fulfillment
- **Evidence:** `app/(shop)/cart/page.tsx:214-271`; `lib/checkout.ts:74-89,217-262`; `supabase/migrations/20260704060110_harden_checkout_payment_contract.sql` (`shipping_cents` is persisted as zero); `orders`/`shipments` schema has an address field but checkout never collects it.
- **Description:** The customer can pay an order while the UI says shipping is “Calculated after launch.” Checkout accepts only items/mode/channel, creates an order with no shipping address/rate, and charges the item total.
- **Customer/business impact:** Undercharging, inability to fulfill, manual collection of personal address/payment differences, refund/support volume, and consumer-law/tax exposure.
- **Failure scenario:** A customer pays SGD 199.00. The order is marked paid, but operations has no delivery address and no shipping charge. Staff must contact the customer or absorb/cancel/refund the order.
- **Root cause:** The payment workflow was productized before the shipping/rate/address contract.
- **Recommended remediation:** Add validated shipping-address capture, supported-zone validation, server-side rate selection, tax treatment, immutable order address snapshot, quote expiration, address privacy controls, and provider-backed checkout tests. Disable paid order checkout until complete.
- **Fixed:** No. Architectural launch prerequisite.
- **Test coverage:** No end-to-end shipping test exists.

### PRD-002 — Manual-invoice checkout reserves stock without credit controls

- **Priority / severity:** P0 / Critical
- **Affected component:** B2B checkout, inventory, accounts receivable
- **Evidence:** `lib/checkout.ts:91-147`; `app/(shop)/cart/invoice-checkout-panel.tsx:87-149`; `app/(shop)/cart/page.tsx:263-279`; `b2b_accounts` contains payment terms/credit limit but invoice creation does not evaluate them.
- **Description:** Any approved B2B account with a pricing tier can create a `pending_payment` manual-invoice order. The same order RPC allocates inventory immediately. There is no credit limit, overdue exposure, payment-terms eligibility, staff approval, idempotency key supplied by the buyer, or automatic expiry/release.
- **Customer/business impact:** Inventory can be trapped by unpaid orders; a compromised or abusive account can exhaust stock; financial exposure is uncontrolled.
- **Failure scenario:** An approved account repeatedly creates invoice orders until all stock is allocated, never pays, and leaves only an exception queue entry after 24 hours.
- **Root cause:** Invoice checkout reuses the prepaid order-allocation path without an accounts-receivable policy/state machine.
- **Recommended remediation:** Require explicit invoice eligibility, enforce transactionally computed outstanding exposure and credit limit, require unique PO/idempotency references, add approval/expiry states, schedule automatic release, and audit all overrides.
- **Fixed:** No. Requires a defined commercial credit policy.
- **Test coverage:** Unit tests cover creation mechanics but not credit/exposure/expiry.

### PRD-003 — Production catalog can present fixture inventory during an outage

- **Priority / severity:** P1 / High
- **Affected component:** Customer catalog and product detail
- **Evidence:** `app/(shop)/catalog/page.tsx:107-203`; `app/(shop)/catalog/[slug]/page.tsx:49-64,247-285`; `e2e/catalog.spec.ts:13-31` explicitly validates preview fixtures.
- **Description:** Missing Supabase configuration or a catalog query error returns fixture products. Live rows are also merged with fixture values for missing fields. Product detail can render an entirely fixture-backed product when the live record is unavailable.
- **Customer/business impact:** Misleading prices, release dates, stock, limits, and product availability; support and reputational risk. Although ordering requires a live SKU ID, the page can still look authoritative.
- **Failure scenario:** Supabase is unavailable and production displays four polished sample products with prices and availability instead of an outage state.
- **Root cause:** A development preview fallback is active in all environments.
- **Recommended remediation:** Make fixtures development/test-only, fail closed in production with a clear unavailable state, and alert on catalog dependency failures.
- **Fixed:** No. The safest implementation needs coordinated page/error-state changes.
- **Test coverage:** Current E2E asserts the unsafe preview behavior rather than production fail-closed behavior.

### PRD-004 — Partial refunds overstated the refund ledger

- **Priority / severity:** P1 / High
- **Affected component:** Stripe webhook, refunds, finance reconciliation
- **Evidence:** Original `lib/stripe-webhooks.ts:160-189` inserted `charge.amount_refunded`; branch changes use the latest `Stripe.Refund.amount` and refund ID; `tests/stripe-refunds.test.ts`.
- **Description:** Stripe’s charge-level `amount_refunded` is cumulative. Two partial refunds of 1,000 cents were stored as 1,000 and 2,000 cents, overstating refunds by 1,000 cents.
- **Customer/business impact:** Incorrect internal ledger, reconciliation mismatches, misleading order/refund state, possible over-refund decisions.
- **Failure scenario:** First refund SGD 10, second refund SGD 10; database total becomes SGD 30.
- **Root cause:** Charge aggregate data was treated as an individual refund event.
- **Recommended remediation:** Persist the individual refund object amount/status/reason and reconcile totals against the provider.
- **Fixed:** Yes, in this branch.
- **Test coverage:** New regression test processes two partial refunds and asserts a 2,000-cent total.

### PRD-005 — Order payment transition was not serialized or strongly bound

- **Priority / severity:** P1 / High
- **Affected component:** Database payment/inventory transition
- **Evidence:** Prior `mark_order_paid` in `20260704060110_harden_checkout_payment_contract.sql` read the order without `FOR UPDATE` and used an unconstrained conflict update. New `20260711000000_lock_order_payment_transition.sql`; `tests/production-payment-guards.test.ts`.
- **Description:** Concurrent payment events could both observe `pending_payment` and decrement inventory. Reusing a provider payment reference associated with another record was not rejected before marking the target order paid.
- **Customer/business impact:** Double inventory decrement, paid order without a matching payment row, and reconciliation failure.
- **Failure scenario:** Concurrent succeeded-event processing or incorrect metadata reaches the RPC twice before the first transaction commits.
- **Root cause:** The idempotency guarantee depended too heavily on the webhook event table rather than the database state transition itself.
- **Recommended remediation:** Lock the order row, validate provider-reference ownership, condition conflict updates on the same order, and retain the unique provider reference.
- **Fixed:** Yes, with a forward migration.
- **Test coverage:** Source/contract regression guard added; production-like concurrent database test still required.

### PRD-006 — Generic admin preorder PATCH bypassed lifecycle invariants

- **Priority / severity:** P1 / High
- **Affected component:** Admin API, preorders, inventory/payments
- **Evidence:** Original `app/api/admin/preorders/[id]/route.ts:11-19`; `lib/orders.ts:57-69,291-307`; guarded allocation API at `app/api/admin/preorders/allocate/route.ts`.
- **Description:** An admin could set any preorder status and arbitrary allocated quantity directly with service-role access, without stock allocation, payment evidence, conversion, release, or audit-state invariants.
- **Customer/business impact:** Orphaned payments/orders, phantom allocation, oversell, and unreconcilable preorder state.
- **Failure scenario:** PATCH a deposited preorder to `converted` with a nonzero allocation but no order/payment transition.
- **Root cause:** A generic CRUD endpoint remained after dedicated state-machine operations were introduced.
- **Recommended remediation:** Expose only named state transitions implemented transactionally in SQL, with reason/actor/audit fields.
- **Fixed:** Yes. The PATCH now authenticates staff and returns a fail-closed conflict response.
- **Test coverage:** Static regression guard verifies the unsafe function is not wired to the route.

### PRD-007 — Staff deactivation was not authoritative for admin APIs

- **Priority / severity:** P1 / High
- **Affected component:** Admin authorization
- **Evidence:** Prior `lib/api/auth.ts:82-101` allowed access when no active staff record existed but app metadata contained `admin`/`ops`; page guard `lib/auth.ts` used active `staff_users` only.
- **Description:** Removing/deactivating a staff row did not revoke API access if stale app metadata remained privileged.
- **Customer/business impact:** Former staff or compromised accounts could continue reading/mutating sensitive operational data through APIs.
- **Failure scenario:** Operator is deactivated in `staff_users`; existing JWT/app metadata still carries `admin`; API request succeeds.
- **Root cause:** Two authorization sources with different revocation semantics.
- **Recommended remediation:** Use one authoritative active-staff source and test deactivation.
- **Fixed:** Yes. Admin APIs now require an active `staff_users` row; docs and tests updated.
- **Test coverage:** Added active/deactivated staff tests.

### PRD-008 — External product images were not permitted by Next Image

- **Priority / severity:** P1 / High
- **Affected component:** Customer catalog/product media
- **Evidence:** Prior `next.config.ts` had no `images.remotePatterns`; `app/_components/product-card.tsx:47-53`; `app/(shop)/catalog/[slug]/page.tsx:87-94`; admin stores Supabase public URLs.
- **Description:** Live product image URLs are external Supabase Storage URLs, but Next Image rejects unconfigured hosts.
- **Customer/business impact:** Broken product pages or runtime image errors after operators upload real media.
- **Failure scenario:** Staff uploads a product image; catalog renders the Supabase URL through `<Image>` and Next rejects the source.
- **Root cause:** Storage integration and image optimization configuration were implemented separately.
- **Recommended remediation:** Allow only the configured Supabase origin and public storage path.
- **Fixed:** Yes. `next.config.ts` derives a narrow build-time allowlist from `NEXT_PUBLIC_SUPABASE_URL`.
- **Test coverage:** Added a config regression assertion.

### PRD-009 — Critical provider and authorization behavior is not integration-tested

- **Priority / severity:** P1 / High
- **Affected component:** QA, auth, RLS, checkout, webhooks
- **Evidence:** `docs/testing.md:92-96`; `docs/build-plan.md` unchecked integration items; Playwright config uses only Chromium; E2E uses preview fixtures.
- **Description:** No test starts local Supabase to assert RLS/privileges, performs authenticated browser flows, or validates Stripe webhook/payment behavior against a provider-compatible test environment.
- **Customer/business impact:** Unit mocks may pass while SQL grants, cookies, OAuth, provider object shapes, redirects, or webhook retries fail in deployment.
- **Failure scenario:** A migration accidentally grants a client write or an authenticated redirect/session cookie fails; CI remains green.
- **Root cause:** Tests focus on pure logic and source-contract markers.
- **Recommended remediation:** Add local Supabase integration tests, authenticated Playwright projects, Stripe CLI/test-mode flows, webhook replay/out-of-order tests, and a staging smoke suite.
- **Fixed:** No.
- **Test coverage:** Gap is the finding.

### PRD-010 — Backup, restore, and disaster-recovery readiness is not evidenced

- **Priority / severity:** P1 / High
- **Affected component:** Database/storage operations
- **Evidence:** No repository match for backup/restore procedures; Terraform provisions Supabase projects but does not declare backup/PITR policy; deployment runs forward migrations before app deploy.
- **Description:** The repository does not specify backup tier, PITR, retention, storage-object recovery, restore ownership, RPO/RTO, or a tested restoration drill.
- **Customer/business impact:** Data loss or an unsafe migration may be unrecoverable within an acceptable period.
- **Failure scenario:** A faulty production migration corrupts order/payment data and the team cannot demonstrate a recent restorable snapshot.
- **Root cause:** Managed-provider backup assumptions are not codified or verified.
- **Recommended remediation:** Select/verify PITR and retention, document RPO/RTO, automate pre-release backup checks where possible, test restore into an isolated project, and cover product-image storage.
- **Fixed:** No.
- **Test coverage:** None.

### PRD-011 — Production observability and incident response are incomplete

- **Priority / severity:** P1 / High
- **Affected component:** Reliability and operations
- **Evidence:** Health endpoints exist (`app/api/health/route.ts`, `lib/readiness.ts`), but no structured logger, correlation IDs, metrics, traces, error tracker, alert rules, dashboards, or incident-response document were found.
- **Description:** Failures are primarily written with `console.error`. Payment exceptions are visible only when an operator visits the admin queue.
- **Customer/business impact:** Delayed detection of checkout/webhook/database failures and poor ability to reconstruct customer incidents.
- **Failure scenario:** Webhooks repeatedly fail overnight; no page is sent and orders remain pending until manual inspection.
- **Root cause:** Health checks were implemented without a complete telemetry/alerting stack.
- **Recommended remediation:** Add structured privacy-safe logging, request/event correlation IDs, error tracking, payment/webhook metrics, SLO dashboards, actionable alerts, escalation ownership, and an incident runbook.
- **Fixed:** No.
- **Test coverage:** Health unit tests exist; alerting/telemetry tests do not.

### PRD-012 — Public and authenticated endpoints lack abuse controls

- **Priority / severity:** P2 / Medium
- **Affected component:** APIs, auth-adjacent workflows, waitlist, checkout
- **Evidence:** No rate limiter/throttle implementation or request-size policy was found; `readJsonBody` parses the entire request body.
- **Description:** Expensive and state-changing endpoints rely on authentication/validation but have no per-IP/per-account quotas, concurrency limits, or body-size enforcement.
- **Customer/business impact:** Resource exhaustion, notification abuse, inventory-reservation abuse, and higher provider costs.
- **Failure scenario:** An authenticated client repeatedly creates/cancels payment intents or sends oversized JSON bodies.
- **Root cause:** Abuse prevention is not part of the API layer.
- **Recommended remediation:** Add edge/API rate limiting, account-specific sensitive-operation quotas, maximum body/file sizes, idempotency keys, and alerting.
- **Fixed:** No.
- **Test coverage:** None.

### PRD-013 — Full Stripe webhook payloads are retained without a policy

- **Priority / severity:** P2 / Medium
- **Affected component:** Privacy, database, logging/reconciliation
- **Evidence:** `app/api/webhooks/stripe/route.ts:44-50` stores the complete event payload; no retention/deletion policy was found.
- **Description:** Provider payloads may contain customer and payment metadata. They are stored indefinitely in a trusted table and queried by operational code.
- **Customer/business impact:** Excess personal-data retention and larger breach scope.
- **Failure scenario:** Years of webhook payloads remain available to service-role operators despite no operational need.
- **Root cause:** The idempotency/audit record stores the entire event instead of a minimal normalized envelope.
- **Recommended remediation:** Define retention, minimize stored fields, redact unnecessary metadata, restrict access, and schedule deletion/archive.
- **Fixed:** No.
- **Test coverage:** Idempotency markers are tested; privacy retention is not.

### PRD-014 — Third-party notifications run synchronously without bounded retries

- **Priority / severity:** P2 / Medium
- **Affected component:** Webhooks, notifications, reliability
- **Evidence:** `lib/notifications.ts` calls Resend/Telegram/WhatsApp with `fetch` and no timeout/AbortSignal; no queue, retry schedule, or dead-letter worker exists.
- **Description:** Notification delivery happens in request/webhook processing. Provider slowness can lengthen or fail the webhook path; failed notifications are recorded but not automatically retried.
- **Customer/business impact:** Delayed webhook responses, missing confirmations, manual recovery.
- **Failure scenario:** Notification provider hangs; serverless execution times out after the payment transition.
- **Root cause:** Delivery was implemented as direct calls rather than durable background work.
- **Recommended remediation:** Commit domain state first, enqueue notifications, use bounded timeouts/exponential retries, idempotency, DLQ, and operator replay.
- **Fixed:** No.
- **Test coverage:** Provider payload and failure-recording unit tests exist; timeout/queue/retry behavior does not.

### PRD-015 — Cart availability includes incoming stock for normal orders

- **Priority / severity:** P2 / Medium
- **Affected component:** Catalog/cart/checkout consistency
- **Evidence:** `lib/catalog.ts:186-205` calculates cart availability as `available + incoming`; order checkout’s database function requires available physical stock, while preorder mode handles future stock separately.
- **Description:** The regular cart can tell a customer incoming units are available, but order checkout may reject them.
- **Customer/business impact:** Misleading availability and failed checkout at the last step.
- **Failure scenario:** On-hand is 0, incoming is 10; cart displays 10 available for a normal order, then order allocation fails.
- **Root cause:** Display availability conflates immediate and future inventory.
- **Recommended remediation:** Distinguish on-hand orderable stock from preorder/incoming stock throughout quote and UI.
- **Fixed:** No.
- **Test coverage:** Pure commerce tests exist; cross-page availability consistency is not covered.

### PRD-016 — Browser security policy is incomplete

- **Priority / severity:** P2 / Medium
- **Affected component:** Customer/admin frontend security
- **Evidence:** `vercel.json` sets frame, MIME, referrer and permissions headers, but CSP contains only `frame-ancestors`, `base-uri`, and `object-src`; no repository HSTS declaration was found.
- **Description:** Existing headers prevent several classes of attack but do not provide a script/style/connect/image source policy or a repository-verifiable transport policy.
- **Customer/business impact:** Reduced defense in depth against XSS/content injection or deployment misconfiguration.
- **Failure scenario:** A future injection flaw has no restrictive nonce/hash/source CSP to limit execution.
- **Root cause:** CSP was scoped to clickjacking/object restrictions to avoid breaking Next/Stripe without completing nonce/source integration.
- **Recommended remediation:** Implement a tested nonce/hash CSP compatible with Next and Stripe, confirm platform HSTS/TLS, and add header integration tests against deployed responses.
- **Fixed:** No.
- **Test coverage:** Source-contract header test exists, not browser enforcement.

### PRD-017 — Accessibility and browser compatibility are not release gates

- **Priority / severity:** P2 / Medium
- **Affected component:** Customer/admin frontend QA
- **Evidence:** `playwright.config.ts:22-27` runs only Desktop Chrome; no axe/WCAG tooling or accessibility workflow was found.
- **Description:** The UI contains many labels and semantic elements, but there is no automated accessibility scan, keyboard/focus test, or Safari/Firefox/mobile-browser project.
- **Customer/business impact:** Undetected keyboard, screen-reader, focus, contrast, or browser-specific failures.
- **Failure scenario:** Stripe/cart/admin interaction works in Chromium but fails in WebKit or loses focus/error announcement for keyboard users.
- **Root cause:** Browser smoke is optimized for speed rather than compatibility/compliance.
- **Recommended remediation:** Add axe scans, keyboard/focus assertions, mobile viewport coverage, Firefox/WebKit projects, and manual accessibility acceptance criteria.
- **Fixed:** No.
- **Test coverage:** Basic role-based locators provide partial semantic coverage only.

### PRD-018 — CI lacks automated dependency and static security scanning

- **Priority / severity:** P2 / Medium
- **Affected component:** Supply chain and CI
- **Evidence:** Dependabot runs weekly, but no `npm audit`, OSV, CodeQL, Semgrep, secret scan, or container scan was found in workflows.
- **Description:** Dependency updates are proposed, but vulnerable dependencies or code patterns do not block a PR/release.
- **Customer/business impact:** Known vulnerabilities can reach production unnoticed between manual reviews.
- **Failure scenario:** A high-severity transitive package advisory is present while lint/test/build remain green.
- **Root cause:** Quality checks were implemented without security-analysis gates.
- **Recommended remediation:** Add SCA with a documented severity policy, CodeQL/static analysis, secret scanning, and immutable action SHA pinning where feasible.
- **Fixed:** No.
- **Test coverage:** Not applicable.

### PRD-019 — No staging environment or production-like release rehearsal

- **Priority / severity:** P2 / Medium
- **Affected component:** Deployment/release management
- **Evidence:** Terraform `active_supabase_environments` contains only development and production; environment contract and deployment inputs expose only those targets.
- **Description:** Changes go from local/CI and development to production without a durable production-like staging environment for OAuth, webhooks, migrations, and smoke tests.
- **Customer/business impact:** Configuration/provider differences are discovered during production deployment.
- **Failure scenario:** Google callback URLs or Stripe webhook subscriptions work in development but are incorrect in production.
- **Root cause:** Two-environment topology.
- **Recommended remediation:** Add staging with isolated Supabase/Stripe/Vercel configuration, production-like data shape, deployment approval, and end-to-end smoke tests.
- **Fixed:** No.
- **Test coverage:** Environment contract tests cover two targets only.

### PRD-020 — Customer data retention, export, and deletion are undefined

- **Priority / severity:** P2 / Medium
- **Affected component:** Privacy/account management/database
- **Evidence:** No account deletion, data export, anonymization, retention schedule, or privacy runbook was found. Webhook, audit, notification, customer, order, and address-capable tables can retain personal data.
- **Description:** The system supports profile updates and operational history but not a defined data-subject lifecycle.
- **Customer/business impact:** Privacy-request handling is manual and may conflict with financial-record retention obligations.
- **Failure scenario:** A customer requests deletion and operators have no approved procedure for anonymizing profile/contact data while preserving statutory order records.
- **Root cause:** Commercial data model was completed before privacy operations.
- **Recommended remediation:** Define legal retention classes, export/delete/anonymize workflows, audit access, document exceptions, and test cascading behavior.
- **Fixed:** No.
- **Test coverage:** None.

### PRD-021 — Admin operational UX is not yet support-team scale

- **Priority / severity:** P2 / Medium
- **Affected component:** Admin frontend
- **Evidence:** `app/(shop)/admin/page.tsx` loads many datasets into a single page; several lists use fixed limits; no generic pagination/export/bulk-action framework or confirmation primitive was found.
- **Description:** The admin surface is functional for a small operator group but will degrade with real order/customer volume and increases accidental-action risk.
- **Customer/business impact:** Slow support work, missed records beyond limits, and accidental destructive transitions.
- **Failure scenario:** An operator cannot locate an older exception/order or submits a state-changing form without a confirmation/recovery path.
- **Root cause:** Initial operational surface optimized for feature coverage, not volume/usability.
- **Recommended remediation:** Add server-side pagination/search, explicit confirmations for irreversible actions, result feedback, bulk-action safeguards, exports, and role-specific permissions.
- **Fixed:** No.
- **Test coverage:** Source wiring and form-parser tests exist; real operator workflow tests do not.

### PRD-022 — Repository governance metadata is incomplete

- **Priority / severity:** P3 / Low
- **Affected component:** Repository/legal/maintainability
- **Evidence:** No `LICENSE` file was found; verified branch-protection/ruleset settings are not represented as code in the audit evidence.
- **Description:** Usage rights and required review/check policy are not fully evident from the repository.
- **Customer/business impact:** Legal ambiguity and governance drift.
- **Failure scenario:** Contributors or deployers cannot determine redistribution rights; required checks are changed outside code.
- **Root cause:** Operational code was prioritized over repository governance artifacts.
- **Recommended remediation:** Add the intended license and codify/document branch protection, required reviews, signed commits/releases, and environment approvals.
- **Fixed:** No.
- **Test coverage:** Bootstrap/config tests cover some GitHub setup assumptions but not current hosted settings.

## 4. Changes made

| File | Change | Reason | Coverage/compatibility |
| --- | --- | --- | --- |
| `lib/stripe-webhooks.ts` | Persist individual Stripe refund amount, status, reason, and refund ID. | Prevent cumulative refund overstatement. | `tests/stripe-refunds.test.ts`; compatible with existing refund table. |
| `tests/stripe-refunds.test.ts` | Added two-partial-refund regression. | Demonstrate correct ledger total. | New Vitest coverage. |
| `supabase/migrations/20260711000000_lock_order_payment_transition.sql` | Replaces `mark_order_paid` with order row lock and payment-reference ownership checks. | Prevent concurrent/detached payment transitions. | Forward-only; apply before app deployment. Static contract test added; production-like concurrency test remains. |
| `app/api/admin/preorders/[id]/route.ts` | Disabled generic lifecycle PATCH after staff authentication. | Prevent state-machine bypass. | API clients using this undocumented generic PATCH now receive 409 and must use named workflows. |
| `lib/api/auth.ts` | Require active `staff_users` row for admin APIs. | Make deactivation authoritative. | `tests/auth.test.ts` updated. Metadata-only API admins will lose access and must be provisioned as staff. |
| `tests/auth.test.ts` | Added active/deactivated admin authorization tests. | Protect revocation behavior. | New Vitest coverage. |
| `next.config.ts` | Allow Next Image only for configured Supabase public storage path. | Make live product images render safely. | Requires `NEXT_PUBLIC_SUPABASE_URL` at build time; regression assertion added. |
| `tests/production-payment-guards.test.ts` | Added migration, preorder-route, and image-config contract guards. | Prevent regression of high-risk controls. | Source/SQL contract coverage. |
| `docs/security.md` | Document active staff as the sole admin authority. | Keep security docs consistent with code. | Documentation only. |
| `docs/production-readiness-audit-2026-07-11.md` | This audit report. | Record evidence, scores, findings, gates, and residual risk. | Documentation only. |

No production data was modified. No production database was contacted. No secrets were read, printed, or committed. No existing migration was edited or reordered.

## 5. Verification evidence

### Commands and checks

| Validation | Result | Evidence / reason |
| --- | --- | --- |
| Repository access and metadata | Passed | GitHub connector resolved `kingyx3/marketplace`, `main`, permissions, files, commits, and workflows. |
| Local clone | Failed | `git clone` could not resolve `github.com` from the execution sandbox. No claim is made that local checks ran. |
| Dependency installation (`npm ci`) | Not executed locally | Source checkout was unavailable in the sandbox. CI is the verification path. |
| Formatting validation | Not available | No standalone format-check script is declared in `package.json`. |
| Lint (`npm run lint`) | Pending GitHub Actions | PR #43 opened; do not treat pending as passed. |
| Type check (`npm run typecheck`) | Pending GitHub Actions | PR #43 opened; do not treat pending as passed. |
| Unit tests (`npm test`) | Pending GitHub Actions | Includes new regression tests. |
| Integration tests | Not available | Repository documents that local Supabase/RLS and Stripe integration tests are not implemented. |
| End-to-end (`npm run test:e2e`) | Pending GitHub Actions | Existing suite is Chromium preview smoke, not authenticated/provider-backed E2E. |
| Production build (`npm run build`) | Pending GitHub Actions | PR #43 opened; result must be checked before merge. |
| Migration validation | Pending GitHub Actions | CI applies all SQL migrations and seed to PostgreSQL 15. Hosted Supabase behavior is still unverified. |
| Terraform validation | Expected from path-filtered CI where applicable; not a code-path change | Existing workflows validate format/init/validate for infrastructure changes. |
| Dependency/security scan | Not available | No blocking SCA/static-analysis workflow found. |
| Current `main` commit status | No passing evidence found | GitHub combined status/workflow query returned no completed checks for the audited base commit. |
| Draft PR creation | Passed | Draft PR #43 opened from `agent/production-readiness-audit` to `main`. |

### Important interpretation

A queued or absent check is not a pass. Before merging, all PR checks must complete successfully and the SQL migration should also be exercised against an isolated Supabase project with realistic existing rows and concurrent payment calls.

## 6. Deployment checklist

### Release gate

- [ ] Resolve every P0 finding.
- [ ] Resolve or formally block deployment on every remaining P1 finding.
- [ ] Require passing lint, typecheck, unit tests, build, Playwright, migration apply, environment contract, and configuration checks on the exact release SHA.
- [ ] Complete a staging rehearsal using the exact production deployment path.

### Environment and secrets

- [ ] Provision `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Provision `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Provision `SUPABASE_SECRET_KEY` only to trusted server/deployment contexts.
- [ ] Provision `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` from the same Stripe environment.
- [ ] Provision a canonical HTTPS `NEXT_PUBLIC_SITE_URL`.
- [ ] Configure Google OAuth client ID/secret and exact callback URLs.
- [ ] Configure verified sender/support email and notification credentials only for channels intended for launch.
- [ ] Confirm GitHub Environment reviewers, least-privilege secrets, and Vercel/Supabase/GCP credentials.
- [ ] Confirm no development/test secret or fixture value is present in production.

### Database and storage

- [ ] Verify Supabase project region/tier/capacity and connection/API limits.
- [ ] Enable and verify required backup/PITR policy; record RPO/RTO.
- [ ] Take/verify a recoverable pre-release snapshot according to policy.
- [ ] Apply all migrations to an isolated copy of production-shaped data.
- [ ] Exercise `mark_order_paid` concurrently and verify one inventory decrement/payment association.
- [ ] Confirm RLS/grants for anon, authenticated, and service role with executable tests.
- [ ] Verify indexes with representative query plans and dataset size.
- [ ] Provision `product-images`, upload/read/delete a safe image, and verify the build-time image allowlist.
- [ ] Define webhook/audit/notification retention and deletion jobs.

### Commerce and external integrations

- [ ] Implement and test shipping address, supported destinations, shipping rates, tax, and order address snapshots.
- [ ] Decide whether incoming stock is preorder-only; align catalog, cart, and checkout.
- [ ] Implement B2B invoice eligibility, credit limits, outstanding exposure, terms, approval, idempotency, and expiry/release.
- [ ] Configure Stripe PayNow and exact webhook events; test signed delivery, duplicate, retry, out-of-order, partial refund, full refund, and failure cases.
- [ ] Verify refund reconciliation against Stripe totals.
- [ ] Configure notification providers with timeouts/retry/queue behavior and test provider outage handling.
- [ ] Verify Google OAuth login, logout, session expiry, deactivated staff, and recovery from rejected/expired sessions.

### Domain, transport, and browser security

- [ ] Configure production domain and DNS.
- [ ] Verify TLS and HSTS at the deployed edge.
- [ ] Verify OAuth and Stripe callback/webhook URLs use the canonical domain.
- [ ] Verify no permissive CORS header is introduced.
- [ ] Confirm secure/HTTP-only/SameSite cookie behavior in production.
- [ ] Implement/test a fuller CSP compatible with Next and Stripe.
- [ ] Verify clickjacking, MIME, referrer, permissions, cache, and sensitive-route headers from the deployed response.
- [ ] Add rate limits, request-size limits, and abuse alerts.

### Observability and operations

- [ ] Add structured privacy-safe logging and correlation IDs.
- [ ] Add error tracking, metrics, tracing, dashboards, and alerts for checkout, webhook failures, pending payments, refund mismatches, inventory allocation, auth errors, and database saturation.
- [ ] Define SLOs and alert ownership/on-call escalation.
- [ ] Add a durable job/retry/DLQ mechanism for notifications and reservation cleanup.
- [ ] Write incident, payment-reconciliation, webhook-replay, backup-restore, and provider-outage runbooks.
- [ ] Conduct and record a restoration drill.

### Pre-deploy and smoke tests

- [ ] Confirm production catalog contains only approved live listings and never fixture products.
- [ ] Complete a real test customer OAuth flow.
- [ ] Complete a low-value test-mode PayNow order and verify order/payment/inventory/notification records.
- [ ] Complete preorder deposit/allocation/balance conversion.
- [ ] Complete partial and full refund tests.
- [ ] Complete approved and rejected wholesale journeys.
- [ ] Complete admin inventory, catalog, order packing/shipping, payment exception, and staff deactivation tests.
- [ ] Run automated accessibility and Chrome/Firefox/WebKit/mobile smoke tests.

### Rollback and post-deploy

- [ ] Record the prior immutable Vercel deployment and promotion command.
- [ ] Prepare a forward-revert migration for every schema/function change that could require rollback.
- [ ] Define rollback decision owner and thresholds.
- [ ] Verify deep readiness after deployment.
- [ ] Verify recent webhooks, payment exceptions, error tracking, and alert delivery.
- [ ] Reconcile first production orders/refunds manually against Stripe and inventory.
- [ ] Confirm backups continue after deployment.

## 7. Residual risks and unverified areas

The following were not treated as passing:

- No local source checkout or command execution was possible because the sandbox could not resolve GitHub.
- GitHub Actions results were pending at the time this report was committed.
- No production, staging, Supabase, Vercel, Stripe, Google OAuth, notification-provider, or GCP credentials were used.
- No provider dashboards or hosted configuration were inspected; repository configuration may differ from deployed reality.
- No production-like dataset, load test, query plan, database connection saturation test, or migration-duration measurement was available.
- No real browser session, customer identity, staff identity, PayNow payment, refund, webhook replay, email delivery, or storage upload was executed.
- Current branch protection, environment approval, secret scanning, Dependabot alert status, and provider backup settings were not verifiable from repository files alone.
- Legal requirements for tax, invoicing, privacy retention, marketing consent, refunds, and consumer disclosures were not specified and require jurisdiction-specific review.
- Marketplace disputes, returns, customer cancellation, chargebacks, and support escalation are not represented as complete product workflows.

## 8. Pull request

Draft PR #43 contains only bounded remediation and tests. It does not claim to solve shipping, B2B credit, observability, backup, privacy, or provider-backed testing through an unsafe rewrite.

The PR description must be updated before review with:

- final CI results on the latest SHA;
- exact database migration and build-time environment implications;
- remaining P0/P1/P2 findings;
- staging verification evidence;
- rollback ownership and steps.

## Final decision

NOT READY — unresolved P0/P1 shipping, B2B credit/reservation, fixture failover, provider-backed testing, backup/restore, and observability risks remain.
