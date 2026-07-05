# Admin operations

This repo ships a limited protected admin surface and admin APIs, but
not a complete browser admin console. Admin work is still runbook-driven
until the Phase 1 admin tools in `docs/build-plan.md` are fully built.
Do not describe manual admin workflows as product features.

## Current operating model

- Infrastructure and deployment config live in git, GitHub Environments,
  Supabase, Stripe, and Vercel.
- Runtime data lives in Supabase Postgres. Production data changes must
  be traceable in an issue or PR, even when the change is made through
  Supabase Studio.
- Money state is Stripe-first and webhook-driven. Never mark a payment
  or order as paid from client-provided state. Admin reconciliation must
  use the explicit `record_manual_reconciliation` action with provider,
  payment reference, amount, currency, reason, and actor.
- Admin changes that affect inventory, pricing, allocation, B2B status,
  refunds, or payment state require a second human review in production.
- Order/payment admin actions are constrained: packing requires paid,
  shipping requires paid/packing, unpaid cancellation releases allocation
  transactionally, and exception flags persist in `payment_exceptions`.

## Routine runbooks

### Catalog or inventory correction

1. Confirm the requested SKU, set, quantity, currency, and price source.
2. Prefer a product-admin workflow once built. Until then, make the
   smallest Supabase data edit required and record the reason externally.
3. Verify `inventory.allocated <= inventory.on_hand + inventory.incoming`.
4. Check the public catalog after deploy or data change.

### Stripe webhook or payment exception

1. Find the Stripe event id in the Stripe dashboard.
2. Confirm the same id in `webhook_events`.
3. If the event was verified but ignored, inspect the route behavior
   before retrying. Verified duplicates should remain idempotent.
4. If a manual correction is unavoidable, use the admin reconciliation
   action so the payment row, order transition, inventory release, reason,
   and audit log are recorded together.
5. Review `/api/admin/orders/exceptions` for persisted manual flags and
   derived stale/orphan/failed-payment signals.

### Pre-order allocation

1. Confirm incoming stock and channel reserve rules before customer
   communication.
2. Run the SKU-scoped allocation action from the protected admin
   inventory table or `POST /api/admin/preorders/allocate` only after
   inventory and pricing data are current.
3. Capture balances through the authenticated customer balance
   PaymentIntent flow only.
4. Record skipped or partially-filled customers for support follow-up.

The allocation action reads live `allocation_rules`, open deposited
preorders, and inventory capacity, then persists deltas through
`apply_preorder_allocations`. Re-running the action is safe for already
filled preorders because only outstanding quantity is considered.

### B2B approval

1. Verify business identity and channel eligibility outside the app.
2. Approve the B2B account from the protected admin page and select the
   required pricing tier in the same form.
3. Reject applications that do not qualify; the rejection leaves the
   customer-visible status as rejected until the customer resubmits.
4. Re-check pricing tier visibility on catalog, product, and cart pages
   after approval.

Pricing-tier removal is not yet productized; use a reviewed service-role
data change if an approved customer's tier must be removed.

### Deploy incident

1. Stop new production releases by leaving the GitHub Environment
   approval pending.
2. Roll back the Vercel deployment if the app deploy caused the issue.
3. For schema mistakes, ship a new forward migration; never edit an
   applied migration.
4. Rotate provider secrets in the provider dashboard, then update the
   GitHub Environment and rerun deploy.

## Admin tooling backlog

- Google/Supabase-authenticated admin entry point.
- Server-side role checks backed by non-user-editable authorization data.
- Product, inventory, pricing, and B2B workflows.
- Browser UI for payment exception and refund workflows with Stripe
  reconciliation.
- Allocation review, approval, and customer notification queue.
- Audit views for inventory, payment, order, and admin changes.
