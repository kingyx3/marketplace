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
  key is a secret** because it bypasses RLS. Stripe's publishable key is
  browser-visible config; Stripe secret and webhook keys are server-only.
- Rotation: change in provider dashboard → update GitHub Environment →
  re-run deploy (env re-syncs to Vercel automatically).
- `TARGET_ENV` is a non-secret deploy guard. It must match the selected
  GitHub Environment before migrations or Vercel changes run.

## Response headers

`vercel.json` defines production-safe response headers for every route:
frame embedding is denied, MIME sniffing is disabled, referrers are
trimmed cross-origin, browser permissions are minimized, and API routes
return `Cache-Control: no-store, max-age=0`.

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

## Storage

Product images live in the public Supabase Storage bucket
`product-images`, created by SQL migration. Public reads are allowed for
catalog media; object insert/update/delete is limited to the service
role or authenticated active staff through `current_user_is_staff()`.

## Admin boundary

Admin routes require server-verified staff access from `staff_users` or
server-controlled app metadata. Order/payment mutations are explicit
actions, not generic status writes:

- `mark_packing` requires a paid order.
- `ship` requires a paid or packing order plus carrier/tracking.
- `cancel_unpaid` only applies to draft/pending-payment orders and
  releases allocation in the same database transaction.
- `record_manual_reconciliation` requires provider, payment reference,
  amount, currency, reason, and actor; amount/currency must match the
  order before it can mark paid.
- `flag_payment_exception` writes `payment_exceptions` for operator
  review.
- `admin_create_supplier_purchase_order` validates supplier, SKU,
  quantity, unit cost, currency, and actor before creating a confirmed
  PO and incrementing incoming stock.
- `admin_remove_b2b_pricing_tier` removes one assigned wholesale tier and
  records the actor; wholesale checkout remains blocked until a current
  tier is assigned.
- `admin_upsert_catalog_product`, `admin_upsert_booster_box_sku`, and
  archive/restore functions validate slug/SKU/currency/integer-cent
  fields and preserve historical rows instead of deleting product data.
- `admin_adjust_inventory` requires a reason code and actor before
  changing stock counters.

Manual admin changes must follow `docs/admin-operations.md` and require
trusted operator access. B2B approval and rejection are explicit
service-role transitions; approval requires a pricing tier assignment in
the same database function. Supplier setup UI remains roadmap work.
The admin payment-exception console posts to the same audited action path
as the API and cannot directly set an order to `paid`.

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
- B2B checkout fails closed unless the customer has an approved wholesale
  account and an assigned pricing tier; tier minimum order values are
  enforced before any PaymentIntent is created.
- Wholesale prices are rendered only from server-verified customer
  approval and tier assignment. Guests and unapproved accounts receive
  retail pricing only.
- Checkout order creation persists the server-derived subtotal,
  discount, and total, then rejects the request if the database re-read
  no longer matches those expected values.
- The storefront confirms Stripe PaymentIntents with Stripe Elements.
  The browser sends only SKU IDs/quantities and an auth token to
  `/api/checkout`; it receives a `clientSecret` and never sends or trusts
  prices, totals, currency, discounts, inventory, or billing state.
- The cart cookie is cleared only after Stripe confirms a successful
  client-side payment. Failed, cancelled, and processing attempts keep the
  cart available; explicit cancellation releases the pending order
  allocation and cancels the unconfirmed PaymentIntent.
- Stripe paid events must match the stored order amount and currency
  before `mark_order_paid` can release allocation, decrement inventory,
  and mark the order paid. Duplicate paid events are idempotent and do
  not decrement inventory twice.
- Order confirmation email is claimed with a unique notification dedupe
  key before calling Resend. Duplicate webhooks do not send a second
  email; provider failure is recorded on the notification row and does
  not roll back paid order state.
- Pre-order deposits use PaymentIntents with `capture_method: manual`
  (authorize now, capture at allocation) so uncaptured funds are
  releasable on cancellation without a refund flow.
- Pre-order allocation is admin-only and persists through
  `apply_preorder_allocations`, which refuses deltas beyond
  `inventory.on_hand + inventory.incoming` and only considers
  outstanding preorder quantity.
- Pre-order balances are created from server-side preorder rows. The
  client sends only auth plus the preorder id; `mark_preorder_balance_paid`
  validates provider amount/currency against the remaining allocated
  balance before creating the converted paid order.
- Live Stripe keys exist only in the `production` GitHub Environment,
  which requires human approval to deploy.

## Notifications

- Notification providers are feature-gated by environment keys. Missing
  email keys record a skipped notification instead of crashing checkout
  or webhook processing.
- Resend secrets stay server-side. Transactional email payloads include
  order number, item names/SKUs, amount, status, order link, and support
  contact, but never provider secrets or raw payment credentials.

## Readiness checks

- `/api/health` is intentionally shallow so deploy smoke tests can prove
  the app process is serving traffic without requiring runtime
  dependencies.
- `/api/health?deep=1` checks Supabase connectivity, Stripe config
  presence, and notification provider status using key names/statuses
  only. It never returns secret values.

## Least privilege elsewhere

- Workflows request `permissions: contents: read` only.
- The CI job needs no secrets at all — anyone can safely run it on a fork PR.
- Deployment app checks and migration SQL validation run before mutable
  Supabase/Vercel deploy jobs.
- `SUPABASE_ACCESS_TOKEN` / `VERCEL_TOKEN` are deploy-time only and are
  never written into the runtime `.env` (enforced by `deployOnly` in the
  env contract and covered by a unit test).
