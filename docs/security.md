# Security

## Secrets handling

- Real values live **only** in GitHub Environment secrets and provider
  dashboards. `.env` is generated (`scripts/generate-env.mjs`), chmod
  600, and gitignored; `.env.example` documents keys with empty values.
- Validation output names keys, never values. The deploy workflow pipes
  values into `vercel env add` via stdin — nothing echoes to logs.
- Key split: `NEXT_PUBLIC_*` values are vars (browser-visible by
  design); everything else is a secret. The Supabase **anon key is
  var-class** because RLS is the security boundary; the **service-role
  key is a secret** because it bypasses RLS.
- Rotation: change in provider dashboard → update GitHub Environment →
  re-run deploy (env re-syncs to Vercel automatically).
- `TARGET_ENV` is a non-secret deploy guard. It must match the selected
  GitHub Environment before migrations or Vercel changes run.

## Row-level security

RLS is enabled on every table and Data API exposure is granted
explicitly in migrations. Policy tiers:

1. **Public read** — catalog + availability only.
2. **Own rows** — customers select their own commercial documents via
   `auth.uid()`; customer profile updates include `WITH CHECK` so a row
   cannot be reassigned to another auth user.
3. **Service role only** — supply, pricing, allocation, refunds, audit,
   webhook tables have no client policies at all.

All writes to commercial tables go through server code using the
service role, so price calculation, stock checks, and state machines
cannot be bypassed from a browser.

## Admin boundary

No browser admin console is built yet. Manual admin changes must follow
`docs/admin-operations.md`, use trusted operator access only, and leave
an external audit trail until the protected admin UI exists.

## Webhooks (Stripe)

`app/api/webhooks/stripe/route.ts` enforces, in order:

1. **Signature verification** against `STRIPE_WEBHOOK_SECRET` using the
   raw request body (never a re-serialized parse).
2. **Idempotency**: event id inserted into `webhook_events` under
   `unique (provider, event_id)`; duplicate ⇒ 200 with no side effects.
3. **2xx for verified-but-ignored events** so Stripe doesn't retry
   forever; 4xx only for signature failures.

## Payments

- Amounts are integer cents; the client never supplies a price — the
  server derives it from `booster_box_skus` + `pricing_tiers`.
- Checkout order creation persists the server-derived subtotal,
  discount, and total, then rejects the request if the database re-read
  no longer matches those expected values.
- Stripe paid events must match the stored order amount and currency
  before `mark_order_paid` can release allocation, decrement inventory,
  and mark the order paid. Duplicate paid events are idempotent and do
  not decrement inventory twice.
- Pre-order deposits use PaymentIntents with `capture_method: manual`
  (authorize now, capture at allocation) so uncaptured funds are
  releasable on cancellation without a refund flow.
- Live Stripe keys exist only in the `production` GitHub Environment,
  which requires human approval to deploy.

## Least privilege elsewhere

- Workflows request `permissions: contents: read` only.
- The CI job needs no secrets at all — anyone can safely run it on a fork PR.
- Deployment app checks and migration SQL validation run before mutable
  Supabase/Vercel deploy jobs.
- `SUPABASE_ACCESS_TOKEN` / `VERCEL_TOKEN` are deploy-time only and are
  never written into the runtime `.env` (enforced by `deployOnly` in the
  env contract and covered by a unit test).
