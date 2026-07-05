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
- Supplier purchase-order intake is constrained to the protected admin
  page and records the PO, line item, incoming stock delta, staff actor,
  and audit entry in one service-role transaction.
- B2B pricing-tier removal is constrained to the protected admin page and
  leaves the account approved but inactive for wholesale checkout when no
  assigned tier remains.
- Product, SKU, product-image, and inventory changes are constrained to
  protected admin actions. Inventory adjustments require a reason code and
  preserve the database oversell invariant.
- Drop-alert delivery is constrained to the staff-only API and writes
  notification rows with dedupe keys before calling external providers.

## Routine runbooks

### Catalog or inventory correction

1. Confirm the requested SKU, set, quantity, currency, and price source.
2. Use the protected admin catalog forms for product/SKU create, update,
   archive, restore, and product-image upload.
3. Use the protected inventory form for stock corrections and choose the
   closest reason code (`stock_count`, `supplier_update`, `damage`,
   `correction`, or `other`).
4. Verify `inventory.allocated <= inventory.on_hand + inventory.incoming`.
5. Check the public catalog after deploy or data change.

### Supplier purchase order intake

1. Confirm the supplier, SKU, quantity, unit cost, currency, expected date,
   and reviewer approval before recording a PO.
2. Use the protected admin purchase-order form. Do not increment
   `inventory.incoming` with a separate direct edit for the same PO.
3. Confirm the new PO appears in the purchase-order list and that the
   inventory row's incoming quantity increased by the recorded quantity.
4. Keep supplier setup as a reviewed service-role data change until
   supplier CRUD is productized.

### Stripe webhook or payment exception

1. Find the Stripe event id in the Stripe dashboard.
2. Confirm the same id in `webhook_events`.
3. If the event was verified but ignored, inspect the route behavior
   before retrying. Verified duplicates should remain idempotent.
4. If a manual correction is unavoidable, use the admin reconciliation
   form in the protected admin payment-exception queue so the payment
   row, order transition, inventory release, reason, and audit log are
   recorded together.
5. Review `/api/admin/orders/exceptions` for persisted manual flags and
   derived stale/orphan/failed-payment signals.

### B2B invoice or bank-transfer order

1. Customer creates the invoice order from the B2B cart. This allocates
   stock and records a `manual_invoice` payment placeholder.
2. Use the displayed invoice reference (`invoice:<order id>`) when asking
   the customer to pay by bank transfer or attach their PO.
3. After funds are verified, use the admin reconciliation form with
   provider `manual_invoice`, the invoice reference, exact amount,
   currency, and reason.
4. Do not mark the order paid by direct status edit.

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

### Drop-alert notification

1. Confirm the SKU is active and has on-hand or incoming availability.
2. Confirm the target notification channel is configured in the selected
   GitHub Environment (`RESEND_*`, `TELEGRAM_BOT_TOKEN`, or
   `WHATSAPP_*`).
3. Use `POST /api/admin/waitlist/notify` with the SKU id from a staff
   session. The response returns sent/skipped/failed/duplicate counts
   only.
4. Review failed rows in `notifications`; do not resend by directly
   calling provider dashboards because that bypasses dedupe/audit state.

### B2B approval

1. Verify business identity and channel eligibility outside the app.
2. Approve the B2B account from the protected admin page and select the
   required pricing tier in the same form.
3. Reject applications that do not qualify; the rejection leaves the
   customer-visible status as rejected until the customer resubmits.
4. Re-check pricing tier visibility on catalog, product, and cart pages
   after approval.
5. Change assigned pricing tiers from the protected admin page when a
   customer's wholesale terms change.
6. Remove assigned pricing tiers from the protected admin page when a
   customer's wholesale terms are suspended.

An approved account with no assigned tier cannot use wholesale checkout;
assign a replacement tier from the same protected admin list before
asking the customer to place B2B orders again.

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
- Pricing and supplier maintenance workflows.
- Supplier setup and maintenance UI.
- Browser UI for payment exception and refund workflows with Stripe
  reconciliation.
- Allocation review, approval, and customer notification queue.
- Audit views for inventory, payment, order, and admin changes.
