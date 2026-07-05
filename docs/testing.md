# Testing

## The suite

| Check                          | Command                                                       | CI job                  |
| ------------------------------ | ------------------------------------------------------------- | ----------------------- |
| Lint (ESLint 9 + next config)  | `npm run lint`                                                | `lint`                  |
| Types (`tsc --noEmit`, strict) | `npm run typecheck`                                           | `typecheck`             |
| Unit tests (Vitest)            | `npm test`                                                    | `test`                  |
| Production build               | `npm run build`                                               | `build`                 |
| Migrations apply cleanly       | `npx supabase db reset` (local)                               | `migrations`            |
| Env contract                   | `npm run env:check`                                           | `validate-env` (deploy) |
| Platform config contract       | `npm run config:check`                                        | `config-contract`       |
| Deploy config contract         | `npm test -- tests/env.test.ts tests/deploy-workflow.test.ts` | `config-contract`       |

CI runs these **in parallel** on every PR with no secrets. The
`migrations` CI job applies every migration + seed to a vanilla
`postgres:15` container using `.github/ci/auth-shim.sql` to emulate the
Supabase-managed `auth` schema. Env/deploy config changes also run
workflow YAML parsing and focused contract tests.

## What's unit-tested now

- `tests/env.test.ts` — the environment contract: accepts a valid env,
  fails fast on missing keys, never leaks values in errors, never writes
  deploy-only keys to `.env`, safely renders `APP_NAME`, and stays in
  sync with `.env.example`.
- `tests/deploy-workflow.test.ts` — deploy workflow guardrails:
  app/migration checks before mutable jobs and expected caller-to-
  environment mapping, including staging/production deep readiness.
- `tests/config-contract.test.ts` — checked-in Vercel security/cache
  headers, Supabase product-image storage migration markers, and CI
  config verifier wiring.
- `tests/health.test.ts` — shallow health without dependencies, app-name
  propagation, and deep readiness success/failure responses without
  secret values.
- `tests/allocation.test.ts` — the allocation engine: rule priority,
  channel reserves, per-customer caps, FIFO partial fills, no oversell.
- `tests/commerce.test.ts` — cart normalization, integer-cent discounts,
  bounded deposits, checkout quantity limits, B2B tier/minimum-order
  enforcement, the PaymentIntent response shape, rollback/cancel
  behavior, and the RPC pricing contract passed to order creation.
- `tests/b2b.test.ts` - wholesale access activation, tier minimums,
  best-discount selection, and integer-cent display pricing.
- `tests/admin-orders.test.ts` - explicit admin order action contract,
  manual reconciliation RPC dispatch, unpaid cancellation dispatch, and
  derived payment exception queue behavior, including admin form payload
  validation for manual reconciliation.
- `tests/admin-surface.test.ts` - protected admin page guard against
  fixture-backed work queues, plus B2B tiered approval/rejection and
  reconciliation-console wiring.
- `tests/notifications.test.ts` - Resend order-confirmation delivery,
  disabled-provider skip behavior, dedupe, provider failure recording,
  and configured-channel detection.
- `tests/preorder-flow.test.ts` - live preorder allocation dispatch,
  duplicate-safe allocation, balance PaymentIntent creation, over-balance
  rejection, Stripe balance conversion, and SQL state-machine guards.
- `tests/live-customer-pages.test.ts` - customer order/preorder display
  helpers and a guard that authenticated account/order/preorder pages do
  not import fixture data.

## Writing tests

Put `*.test.ts` under `tests/`; `@/` resolves to the repo root. Business
logic should be pure functions in `lib/` (like `lib/allocation.ts`) so
it's testable without mocking Supabase or Stripe.

Recommended before pushing:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Not yet in place (see docs/build-plan.md)

Integration tests against a local Supabase (RLS policy assertions),
Stripe flow tests with `stripe-mock`, and Playwright smoke tests are
planned alongside the features that need them.
