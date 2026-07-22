# Build status

This is the current implementation ledger for the retail application. Historical product and market assumptions remain in [`docs/research/`](research/), but they are not the source of truth for deployed architecture or supported workflows.

Use these documents for current behavior:

- [`README.md`](../README.md) — product surface and operator entry points
- [`docs/data-model.md`](data-model.md) — active database and commerce contracts
- [`docs/api-architecture.md`](api-architecture.md) — server boundaries and endpoint rules
- [`docs/deployment.md`](deployment.md) — deployment and release behavior
- [`docs/admin-operations.md`](admin-operations.md) — reviewed control-console workflows

## Built and supported

- Next.js 16 retail storefront with live catalog, listings, limited-time deals, stock state, cart, checkout, customer accounts, orders, and preorders
- Google-only Supabase Auth with server-side session handling and role-scoped administrator access
- Server-derived SGD pricing, shipping, tax, inventory checks, reservation expiry, and immutable order totals
- Hosted HitPay payment requests, signed webhook processing, idempotent payment transitions, refunds, and failed/expired reservation safety
- Retail preorders charged 100% upfront, followed by reviewed allocation, exact shortfall refunds, and conversion into paid orders
- Supabase PostgreSQL migrations, row-level security, service-role commercial mutations, audit logging, seed data, and SQL contract tests
- Protected control-console workflows for catalog, products, product types, products, pricing, images, listings, deals, inventory, purchase orders, preorder allocation, orders, refunds, reconciliation, and payment exceptions
- Customer waitlists and drop notifications with server-side delivery adapters
- Sentry observability, health/readiness endpoints, request correlation, and operational verification
- Vercel, Supabase, Terraform, and GitHub Actions bootstrap, deployment, migration, backup/restore, and release-gate automation
- Vitest unit and architecture tests, Playwright browser tests, linting, strict type checking, configuration validation, production builds, migration tests, and restore checks

## Retired architecture

The following earlier designs are intentionally not part of the active product:

- **Stripe payments.** Runtime payment processing uses HitPay. Stripe references that remain in immutable migrations or historical research explain prior state and must not be treated as active integration points.
- **Deposit-then-balance preorders.** Retail preorders are paid in full. The `deposit_cents` and `balance_cents` column names remain only for stored-schema compatibility; active rows require the full value in `deposit_cents` and zero balance.
- **Wholesale/B2B checkout.** Manual invoice checkout, wholesale pricing tiers, credit controls, and B2B account tables were removed by the wholesale decommission migration. The supported sales channel is retail `b2c`.
- **Fixture-backed authenticated commerce.** Customer order and preorder pages read live Supabase-shaped data and do not import marketplace fixtures.

Do not reintroduce retired providers or workflows through application code, environment variables, documentation, deployment configuration, or tests unless a new architecture decision explicitly restores them.

## Remaining roadmap

- Design-system consolidation and a fuller visual pass
- Search infrastructure beyond database full-text search when measured relevance requires it
- Analytics and operational dashboards for sell-through, margin, preorder conversion, and fulfillment performance
- Carrier-rate integrations when static shipping policies are no longer sufficient

## Historical phase mapping

The research report describes an earlier phase model. For traceability:

1. **Retail commerce foundation:** implemented, with HitPay replacing the original Stripe design.
2. **Preorder differentiation:** implemented, with full upfront payment replacing deposit/balance collection.
3. **Wholesale/B2B:** implemented experimentally and subsequently retired from the active product architecture.
4. **Scale and polish:** partially complete; the remaining roadmap is listed above.

Current implementation claims must be verified against executable code, migrations, tests, and the current documents linked at the top of this file—not against historical research recommendations.
