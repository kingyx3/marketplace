# Testing

## Suite

| Check                        | Command                             | CI job             |
| ---------------------------- | ----------------------------------- | ------------------ |
| Lint                         | `npm run lint`                      | `lint`             |
| Strict TypeScript            | `npm run typecheck`                 | `typecheck`        |
| API architecture boundary    | `npm run test:architecture`         | included in `test` |
| Unit and contract tests      | `npm test`                          | `test`             |
| Production build             | `npm run build`                     | `build`            |
| Browser smoke                | `npm run build && npm run test:e2e` | `e2e-smoke`        |
| Migrations and SQL contracts | `npx supabase db reset` locally     | `migrations`       |
| Environment contract         | `npm run env:check`                 | deploy validation  |
| Platform configuration       | `npm run config:check`              | `config-contract`  |

Pull-request CI runs independent checks in parallel without production secrets. The migrations job applies every migration and the seed to a clean Postgres instance, runs SQL contracts, and verifies logical backup and restore. Environment and deployment changes also run focused workflow and configuration contracts.

## Current coverage

- `tests/env.test.ts` — environment validation, safe errors, generated files, and `.env.example` alignment.
- `tests/deploy-workflow.test.ts` — deployment ordering, target mapping, and readiness guardrails.
- `tests/config-contract.test.ts` — checked-in Vercel, Supabase, and CI configuration markers.
- `tests/health.test.ts` — shallow health and deep readiness behavior without leaking secrets.
- `tests/allocation.test.ts` — retail FIFO allocation, per-customer caps, partial fills, and no oversell.
- `tests/commerce.test.ts` — cart normalization, integer-cent deals, deposits, shipping, checkout limits, current-price quoting, and the order RPC contract.
- `tests/admin-orders.test.ts` — explicit order actions, payment reconciliation, cancellation, and exception behavior.
- `tests/admin-catalog.test.ts` — product and SKU forms, inventory adjustment parsing, and catalog migration markers.
- `tests/purchase-orders.test.ts` — supplier purchase-order intake and inventory integration markers.
- `tests/control-operations-surface.test.ts` — protected catalog, SKU, inventory, purchasing, allocation, and payment-exception controls.
- `tests/notifications.test.ts` — order confirmation and configured drop-alert providers, deduplication, failures, and disabled-provider behavior.
- `tests/waitlist.test.ts` — SKU/customer binding, contact normalization, claims, dispatch, and notified state.
- `tests/preorder-flow.test.ts` — retail allocation queries, HitPay deposit/balance behavior, and removal of invoice checkout.
- `tests/live-customer-pages.test.ts` — live customer page data and guards against fixture-backed authenticated flows.
- `tests/frontend-access.test.tsx` — anonymous, customer, and staff navigation visibility.
- `tests/api-architecture.test.ts` — prevents Client Components from importing database clients or issuing direct Supabase data operations.
- `tests/api-protections.test.ts` — JSON media/size limits and idempotency claim, replay, release, and fail-safe completion behavior.
- `tests/api-protection-migrations.test.ts` — private durable rate-limit and idempotency database contracts.
- `tests/observability.test.ts` — request IDs, safe structured errors, retry metadata, redaction, and Sentry details.
- `e2e/navigation.spec.ts` — primary navigation, Catalog Deals subsection, removed Wholesale route, protected pages, and 404 behavior.
- `e2e/public-smoke.spec.ts` — built storefront, catalog fallback, product detail, empty cart, and shallow health smoke coverage.
- `supabase/tests/*.sql` — RLS, checkout, deals, admin, waitlist, preorder, and schema contracts.

## Writing tests

Place `*.test.ts` or `*.test.tsx` under `tests/`; `@/` resolves to the repository root. Keep business logic in focused `lib/` modules so it can be tested without browser or provider dependencies.

Any new Client Component that needs application data must use `lib/api/client.ts`. The architecture suite intentionally fails when client code imports `lib/supabase.ts`, a general Supabase database client, or direct `.from()`, `.rpc()`, or Storage access. Only `lib/auth/browser-session.ts` may use the browser SDK, and only for session establishment.

Run before pushing:

```bash
npm run lint && npm run typecheck && npm run test:architecture && npm test && npm run build && npm run test:e2e
```

Authenticated provider flows and hosted restore drills are covered by deployment verification rather than anonymous pull-request jobs.
