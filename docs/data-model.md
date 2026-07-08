# Data model

Source of truth: [`supabase/migrations/`](../supabase/migrations/).
Narrative rationale here; the research-report version (why the business
needs these shapes) is `docs/research/09-data-model.md`.

## Entity map

```
tcg_categories ─▶ sets_releases ─▶ products ─▶ product_variants ─▶ booster_box_skus
                                      │                                  │
                                      └──▶ listing_items                 │
                                                                         │
         suppliers ─▶ purchase_orders ─▶ purchase_order_items ───────────┤
                                                                         ▼
customers ─▶ b2b_accounts                                          inventory
   │  └──▶ customer_pricing_tiers ◀─ pricing_tiers
   ├──▶ preorders ──(convert)──▶ orders ─▶ order_items
   │        │                      ├─▶ shipments
   │        └────────┬─────────────┴─▶ payments ─▶ refunds
   ├──▶ notifications│
                     ▼
              allocation_rules          audit_logs   webhook_events
                                             ▲             │
                                             └── payment_exceptions

storefront_configurations ──▶ public catalog copy/configuration
```

## Key decisions

**Money is integer cents + currency code.** No floats anywhere. Default
currency `SGD`; multi-currency is a column, not a refactor. Discounts
are persisted on `orders` as `discount_cents` + `discount_bps`, and
refund rows carry their own currency for reconciliation.

**Pre-orders carry deposit/balance explicitly.** `preorders` has
`deposit_cents` and `balance_cents`, and `payments.kind` distinguishes
`deposit` / `balance` / `full`. This models the standard TCG pre-order
pattern (deposit at announcement, balance at allocation) without
inventing partial-payment logic on orders. A fulfilled pre-order is
_converted_ into an order (`preorders.order_id`), so fulfillment,
shipping, and refunds all live in one place.

**Oversell guard is a database constraint.** `inventory` tracks
`on_hand`, `allocated`, and `incoming` with
`check (allocated <= on_hand + incoming)` and a generated `available`
column. Pre-orders may be taken against confirmed incoming stock, but
the constraint makes overselling a transaction failure rather than a
support ticket.

**Product and SKU archive are state, not destructive deletes.**
`products.active` removes a product from the storefront while preserving
historical order/preorder references. `booster_box_skus.active` does the
same for individual sellable SKUs, and checkout RPCs refuse inactive SKUs
even if a stale cart still contains one.

**Storefront listings are merchandising state.** `listing_items` is a
one-row-per-product layer for title overrides, badges, tags, B2C/B2B
channel metadata, max-per-customer display/input limits,
pre-order-reserve display, featured/sort order, and published visibility.
A trigger creates a default listing row for new products, and the public
catalog only reads published listing rows.

**Storefront configuration is data, not code deploys.**
`storefront_configurations` stores active JSON objects such as
`catalog_header` copy. Staff update it through a service-role RPC, while
anon/authenticated clients can only read active rows.

**Allocation is data, not code branches.** `allocation_rules` (priority,
channel, reserve quantity, per-customer cap) drives who gets scarce
stock — e.g. "reserve 8 boxes for B2C at max 2/customer; B2B takes the
rest FIFO". The pure engine in `lib/allocation.ts` mirrors this and is
unit-tested; the seed ships a working example.

**Preorder allocation is a guarded state transition.**
`apply_preorder_allocations` increments `preorders.allocated_qty` and
`inventory.allocated` together, refuses allocations beyond
`on_hand + incoming`, and derives `balance_cents` from allocated units
minus deposit and captured balance payments. The app computes candidates
from live rows, but the database enforces the stock boundary.

**Supplier PO intake is a guarded stock transition.**
`admin_create_supplier_purchase_order` validates supplier, SKU, quantity,
unit cost, currency, and actor, then records a confirmed
`purchase_orders` row, one `purchase_order_items` row, and increments
`inventory.incoming` in the same service-role transaction. Operators must
not separately edit incoming stock for the same PO.

**Preorder conversion is idempotent.** Balance PaymentIntent success
calls `mark_preorder_balance_paid`, which validates amount/currency
against the remaining allocated balance, records the captured balance
payment, creates one paid order and order item, and stores the order id
on the preorder. Duplicate Stripe events return the existing order id
instead of creating another order or decrementing inventory twice.

**B2B is an approval layer on customers.** Any customer can _apply_ for
a `b2b_accounts` row. `review_status` distinguishes pending, approved,
and rejected applications; approval assigns at least one
`pricing_tiers` row (basis-point discounts + minimum order) through
`customer_pricing_tiers`. Pricing tiers are M:N so a customer can hold
e.g. a regional tier and a promo tier.
Removing the last assigned tier leaves the account approved but disables
wholesale checkout because checkout requires at least one current tier.

**Checkout totals are a database contract.** Server code quotes SKU
prices, B2B discounts, currency, and inventory first, then passes the
expected subtotal/discount/total into
`create_checkout_order_from_cart`. The function re-reads current SKU
prices and allocates inventory atomically; if the quote changed, order
creation fails before Stripe is charged.

**B2B invoice checkout is still an order/payment contract.** Invoice/PO
checkout creates a `pending_payment` order with the same checkout RPC and
stores a `manual_invoice` payment placeholder. The order is not paid
until staff records audited reconciliation with the exact amount,
currency, provider, and invoice reference.

**Audit by trigger.** `audit_logs` is written by a generic trigger on
the money/stock/admin-critical tables (inventory, orders, preorders,
payments, refunds, allocation_rules, b2b_accounts, purchase_orders,
purchase_order_items, listing_items, storefront_configurations). Nobody
has to remember to log.

**Webhook idempotency is a table.** `webhook_events` has
`unique (provider, event_id)`; the Stripe route inserts before
processing and treats a duplicate-key error as "already handled".
`mark_order_paid` also validates Stripe amount and currency against the
stored order total before releasing allocation and decrementing stock, so
duplicate or underpaid payment events fail closed.

**Waitlist entries are customer-owned state.** `waitlist_entries` binds a
customer, SKU, notification channel, and contact target under a unique
`customer_id, sku_id, channel` constraint. The API validates active SKUs
and contact formats server-side, and customers can only read their own
rows through RLS.

**Notification delivery is deduped.** `notifications` stores provider,
provider message id, a unique `dedupe_key`, `sent_at`, and delivery
error state. Order-confirmation email uses `order_confirmation:<order
id>` so duplicate payment webhooks cannot send duplicate customer email.
Drop alerts use a waitlist-entry dedupe key before calling email,
Telegram, or WhatsApp providers. Missing providers are recorded as
`skipped` instead of being treated as checkout failures.

**Product images use managed storage.** Supabase Storage bucket
`product-images` is created by migration with image-only MIME limits and
a 5 MiB object cap. Catalog image URLs can point at public objects in
that bucket, while object writes require active staff or service-role
server code.

**Admin payment exceptions are durable.** `payment_exceptions` records
manual flags and operator-visible payment anomalies without exposing the
table to browser roles. Derived queues can also surface stale pending
payments, orphan Stripe webhook events, and failed/cancelled payments
still attached to unpaid orders.

**Admin order mutations are explicit database actions.** Admin APIs call
service-role-only functions for packing, shipping, unpaid cancellation,
manual reconciliation, and exception flagging. Direct `paid` status
updates are not an API contract; reconciliation must include provider,
payment reference, amount, currency, reason, and actor.

**Admin catalog, listing, and inventory mutations are explicit database
actions.** Product/SKU create, update, archive, image assignment,
listing/configuration upserts, and inventory adjustment go through
service-role-only functions. Inventory adjustment requires a reason code
and keeps the stock invariant enforced in the database.

## Row-level security

RLS is enabled on **every** table:

- Supabase Data API grants are explicit and paired with RLS. Catalog
  (`tcg_categories` → `booster_box_skus`), `inventory` availability,
  published `listing_items`, and active `storefront_configurations`:
  public read.
- `customers`, `preorders`, `orders`, `order_items`, `payments`,
  `shipments`, `b2b_accounts`, `notifications`, `waitlist_entries`:
  customers read their own rows via `auth.uid()`; customer profile
  updates include both `USING` and `WITH CHECK`; all commercial writes
  go through the service role so state machines and stock checks stay
  server-side.
- Supply-side and admin-only tables (`suppliers`, `purchase_orders`,
  `purchase_order_items`, `pricing_tiers`, `allocation_rules`, `refunds`,
  `audit_logs`, `webhook_events`, `payment_exceptions`): no
  anon/authenticated policies at all — service role only.
