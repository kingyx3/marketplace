# Commerce platform roadmap

This document is the persistent planning source for the production-focused commerce programme. It records current maturity, known gaps, dependencies, related work, and the next recommended action so each iteration can assess the repository without relying on conversation history.

Implementation claims must be verified against executable code, migrations, tests, CI, and the active documents linked from [`docs/build-plan.md`](build-plan.md). Historical research under `docs/research/` is context only.

## Maturity states

- **Not started** — no supported implementation exists.
- **Discovery** — the problem and constraints are being investigated.
- **Planned** — scope and dependencies are understood but implementation has not started.
- **In progress** — a focused implementation is currently under review or development.
- **Partially implemented** — a supported subset exists, with material workflow gaps remaining.
- **Production ready** — the supported end-to-end workflow and relevant failure modes are tested and documented.
- **Needs remediation** — an existing capability has a material defect, unsupported dependency, or architectural risk.
- **Deferred** — intentionally postponed until a documented dependency or demand signal exists.

## Prioritisation rules

Work is selected in this order:

1. Data loss, payment failure, inventory inconsistency, or broken ordering.
2. Security and authorization weaknesses.
3. Incomplete or contradictory core commerce workflows.
4. Payment, inventory, and order reliability.
5. Administrator operational efficiency.
6. Customer experience and conversion.
7. Reporting and automation.
8. Advanced platform capabilities.

Candidate work is scored by customer impact, revenue impact, operational impact, security or data-integrity risk, frequency, dependencies, complexity, regression risk, and existing issue priority. Each iteration should produce one small, coherent, tested pull request.

## Capability roadmap

| Capability area | Maturity | Current supported scope | Known gaps and dependencies | Priority | Related work | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- |
| Product and catalogue management | Partially implemented | Retail products, product types, category/set hierarchy, media, product lifecycle, listings, release/availability data, current pricing, and admin workflows | No variant/SKU option model, bulk editing/import/export, bundles, channel/customer-group visibility, or complete SEO/social metadata workflow | High | PR #167 improves precise catalogue lookup | Finish and merge the catalogue lookup work, then define the minimum variant/SKU model without duplicating product and listing ownership |
| Inventory management | Partially implemented | Product-level on-hand, allocated, incoming and safety stock; atomic checkout reservations; expiry release; purchase-order intake; audited adjustments | No SKU/location ledger, damaged/committed dimensions, transfers, reconciliation workflow, bulk CSV, or inventory webhooks | High | Checkout reservation and preorder allocation migrations; supply console | Design a backwards-compatible inventory ledger migration that preserves current atomic reservation guarantees |
| Pricing and promotions | Partially implemented | Integer minor-unit SGD pricing, versioned prices, compare-at pricing, limited-time deals, server revalidation, separate approval permission | No coupons, automatic promotion engine, stacking rules, usage limits, gift cards, store credit, customer-group or volume pricing | Medium | Exact deal pricing and pricing control work | Define canonical promotion eligibility and monetary calculation contracts before adding coupon surfaces |
| Cart and checkout | Production ready | Persistent retail cart, server-derived totals, shipping/tax calculation, atomic stock reservation, duplicate protection, authenticated checkout, direct buy-now, safe redirects, recovery/status reads | Current production claim is limited to the supported retail/HitPay flow; richer saved-address, pickup, abandoned-cart, and multi-shipping workflows remain absent | High | PRs #136, #140, #153, #156, #157, #158 | Preserve current reliability while adding targeted regression coverage for interruption and reservation-expiry customer messaging |
| Payment-provider abstraction | Partially implemented | HitPay payment requests, signed webhooks, canonical local payment state, idempotent settlement/refunds, reconciliation and missed-webhook recovery | The current runtime is HitPay-only; provider adapter boundaries and provider-neutral documentation require continued enforcement before another provider is introduced | High | PR #158; Stripe runtime removal migration and architecture test | Audit provider-specific imports and persistence boundaries, then document the adapter contract before adding any second provider |
| Orders and order lifecycle | Partially implemented | Server-owned order creation, pending/paid/cancelled/refunded handling, order history, admin review, cancellation, payment exceptions, shipment linkage | Full explicit state-machine documentation, safe order editing, manual orders, invoice/receipt generation, exports, return/dispute states, and broader reconciliation remain incomplete | High | PR #159 improves precise order lookup | Merge precise order lookup, then codify valid order transitions in one shared domain contract with state-transition tests |
| Shipping, fulfilment and delivery | Partially implemented | Static shipping policy, packing, shipment arrangement, carrier/tracking references, delivery status updates, fulfilment queue and exceptions | No zones/rate tables, pickup/local delivery, split fulfilment, carrier adapters/rates, packing slips, delivery estimates, or returned-to-sender workflow | Medium | PR #155 delivery operations | Define provider-neutral shipment and carrier adapter contracts before integrating live carrier rates |
| Returns, refunds and exchanges | Partially implemented | Full/partial provider refunds, preorder shortfall refunds, payment exception handling, audited refund authority | No customer return request, eligibility, inspection, exchange, store-credit, restocking decision, or compensating workflow for partial failures | High | Refund and preorder allocation contracts | Model a return case and inventory disposition workflow before exposing customer self-service returns |
| Customer accounts and engagement | Partially implemented | Authenticated profile context, orders, preorders, waitlists/restock notifications, retained customer records, disable/restore administration | Saved addresses/carts, wishlist, preferences, marketing consent, data export, customer account deletion, and richer recovery/session controls remain incomplete | Medium | PR #144 customer operations | Implement saved delivery addresses behind server-owned APIs and clear ownership/RLS tests |
| Merchant and admin operations | Partially implemented | Role-scoped `/control` domains, action-level permissions, list-first modal workflows, audit evidence, catalogue/pricing/supply/orders/fulfilment/customers/finance/governance operations | Content, analytics, settings, broader bulk operations, and some domain-specific approval workflows remain absent | High | PRs #165, #166, #167 and #159 | Finish open precision PRs, then add a cross-domain operational exception dashboard only from existing bounded queries |
| Storefront and content management | Partially implemented | Product/category pages, listings, availability states, deals, storefront configuration, publication readiness, protected publish permission | No structured section builder, navigation editor, scheduled pages, redirect management, FAQ/support CMS, complete metadata and preview workflow | Medium | Storefront listing and configuration controls | Define an original, typed storefront-section schema with preview and publication validation |
| Search and discovery | Partially implemented | Database-backed product search, filters, category/set navigation, deal and availability presentation | No measured relevance programme, typo tolerance, recently viewed, recommendation service, search analytics, or replaceable indexing adapter | Medium | Remaining roadmap in `docs/build-plan.md` | Add bounded search telemetry first; only adopt a specialised provider when measured relevance warrants it |
| Notifications and communications | Partially implemented | Waitlist/drop notifications, delivery adapter boundary, customer notification records | No complete event catalogue, template management, preferences, retries/dead-letter workflow, order/payment/shipment/refund transactional suite, SMS/push adapters | Medium | Customer communications permission and waitlist delivery | Introduce a canonical notification-event outbox with idempotent delivery history |
| Analytics and reporting | Discovery | Operational lists expose bounded current-state data; Sentry and health endpoints provide technical observability | No governed commerce metric definitions or dashboards for revenue, margin, conversion, inventory turnover, retention, refunds, fulfilment, and promotions | Medium | Listed in `docs/build-plan.md` remaining roadmap | Define metric contracts and retention windows before adding dashboard queries |
| Multi-channel and integration readiness | Deferred | Same-origin APIs, application services, database invariants, provider/webhook patterns | No public/partner API keys, scoped external access, outbound webhooks, feeds, accounting/WMS/marketplace adapters, or event versioning | Low | API architecture document | Defer until core retail workflows and event contracts are stable; avoid integrations that bypass domain services |
| Security, privacy and compliance | Partially implemented | Server authentication/authorization, RLS defence in depth, action permissions, validation, rate limiting, idempotency, secret boundaries, redaction, audit logging | Formal retention/deletion policy, customer export/deletion, CSRF review across mutations, dependency security response process, and broader privacy runbooks need completion | High | Issue #22; governance/security documentation | Review dependency/toolchain exposure and customer data lifecycle before adding new sensitive account features |
| Reliability and operations | Partially implemented | Structured request IDs, Sentry, health/readiness, webhook persistence/replay support, commerce worker, reconciliation, migrations, backups/restores, Terraform and release gates | Dead-letter operations, operator-facing replay tooling, SLOs/alerts, maintenance mode, and runbooks for more partial-failure scenarios remain incomplete | High | PR #158 and settlement/recovery work | Add an operator runbook and bounded queue for retryable webhook/payment reconciliation failures |
| Testing and quality assurance | Needs remediation | Vitest unit/architecture tests, SQL contracts, Playwright, configuration checks, strict typing, production builds, migration and restore verification | Main currently carries unsupported ESLint 10 and TypeScript 7 dependency updates that break standard lint/build execution in the documented runner context; mobile/accessibility coverage is uneven | Critical | Dependency PR #163; PR #167 documents the regression | Restore the repository-pinned supported ESLint/TypeScript toolchain and verify the full documented check suite in CI |

## Active pull requests and issues

### Pull requests

- **#167 — Make catalog product lookup precise.** Treat as in-progress catalogue/admin efficiency work; do not duplicate its catalogue page, detail page, control view, tests, or `docs/admin-operations.md` changes.
- **#159 — Make order lookup operationally precise.** Treat as in-progress order/admin efficiency work; do not duplicate its order lookup scope.

### Issues

- **#141 — break db tables up into modules.** Architectural maintainability issue. Before implementation, define module ownership and migration/test boundaries; do not fragment transactional commerce invariants across modules.
- **#22 — Add & configure cloudflare, and other free software for security.** Security discovery item. Evaluate current Vercel/Supabase controls, cost, operational ownership, and measurable threat reduction before introducing another edge dependency.

## Current highest-priority risks

1. **Toolchain/CI regression after dependency PR #163.** The open catalogue PR reports that ESLint 10.7.0 crashes with the Next TypeScript parser and Next rejects TypeScript 7 during production build. Until corrected, standard validation is unreliable.
2. **Inventory is product-level rather than SKU/location-ledger based.** Current atomic reservations are valuable and must not be weakened during any model expansion.
3. **Returns are refund-centric rather than a complete return/exchange workflow.** Inventory disposition and compensating actions are not yet modelled end to end.
4. **Provider abstraction is not yet proven by a second adapter.** Preserve provider-neutral application contracts and keep HitPay details inside the payment domain.
5. **Operational metrics lack governed definitions.** Do not add expensive dashboards before metric semantics, bounds, and retention are documented.

## Iteration history

### 2026-07-27 — Establish persistent roadmap contract

- Reviewed repository metadata, recent commits, open pull requests, open issues, `README.md`, `docs/build-plan.md`, `docs/data-model.md`, `docs/admin-operations.md`, `docs/api-architecture.md`, and existing architecture tests.
- Added this roadmap as the required persistent state for scheduled development runs.
- Added CI coverage that requires all roadmap capability areas, maturity states, and iteration metadata to remain present.
- Linked the roadmap from active documentation.
- Identified the unsupported ESLint 10/TypeScript 7 toolchain as the next highest-value remediation scope.

## Next scheduled iteration

**Recommended scope:** restore the supported lint/type/build toolchain after dependency PR #163 without downgrading unrelated application dependencies.

Acceptance criteria:

- `npm run lint`, `npm run typecheck`, and `npm run build` use versions supported by the current Next.js release and repository Node/npm pins.
- `package.json` and the lockfile agree; no temporary global or uncommitted dependency substitution is required.
- The full documented check suite runs in CI or any pre-existing failure is clearly separated and tracked.
- Dependabot configuration prevents recurrence of unsupported major toolchain upgrades without a compatibility review.
- The roadmap records the completed remediation and the next highest-value commerce scope.
