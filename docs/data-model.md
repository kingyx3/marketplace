# Data model

The executable source of truth is [`supabase/migrations/`](../supabase/migrations/). This document describes the active retail application model after the wholesale decommission migration.

## Entity map

```text
product_types -------------------------> products
                                          ^
tcg_categories -> sets_releases ---------+-> product_variants -> booster_box_skus -> sku_prices
                                          |                         |
                                          -> listing_items          |
                                                                    v
     suppliers -> purchase_orders -> purchase_order_items ------> inventory

customers -> preorders --(allocate)--> orders -> order_items
    |            |                       |-> shipments
    |            +-----------------------+-> payments -> refunds
    |-> notifications
    |-> waitlist_entries

allocation_rules     audit_logs     webhook_events     payment_exceptions
storefront_configurations
limited_time_deals -> booster_box_skus
```

## Core contracts

### Money and totals

Money uses integer cents plus a currency code. Retail checkout quotes current SKU prices, active deals, shipping, tax, and inventory on the server. `create_checkout_order_from_cart` re-reads current data and compares expected totals before allocating stock.

### Catalog and listings

Every product belongs to one category and one set. `product_types` stores the reusable administrator-managed type options shown in product forms. Product records do not require a separately entered name or slug: the database derives the display name from set, product type, and language, and derives the unique slug from category slug, set code, product type code, and language code. The canonical identity is therefore the category–set–type–language combination.

`products` and `booster_box_skus` use active/archive state rather than destructive deletion. Physical SKU records contain identifiers and pack configuration; money is versioned separately in `sku_prices`. The legacy amount fields on `booster_box_skus` are trigger-maintained compatibility caches for existing checkout reads.

`listing_items` stores title overrides, badges, tags, customer limits, preorder reserve, featured ordering, availability mode, optional order windows, release date, and publish state. New listings default to unpublished. Publication requires an active product, active SKU, current price, and configured availability; `available_now` also requires sellable inventory. Active listings are retail-only and use `channels = ['b2c']`.

`limited_time_deals` attaches time-bounded public or member offers to SKUs. Deals are presented inside Products and are revalidated during checkout.

### Inventory and purchasing

`inventory` tracks on-hand, allocated, incoming, and safety stock. Its constraints prevent allocation beyond on-hand plus confirmed incoming stock. Supplier purchase-order intake records the PO and increments incoming stock in one database transaction.

Normal-order checkout reserves inventory with a conditional database update. The pending order receives `checkout_reserved_until = now() + 15 minutes`. Expiry processing releases the allocation and cancels the unpaid order. A payment that succeeds after expiry cannot consume stock; the webhook records it and issues an idempotent HitPay refund.

### Preorders

Retail preorders are charged 100% upfront. Active preorder states require `deposit_cents` to equal the full requested value and `balance_cents = 0`; the legacy column names remain only as stored-schema compatibility. Only a captured `full` payment can enter the allocation queue.

Allocation is an administrator-confirmed, preorder-only process. The control workspace previews FIFO allocation with any configured per-customer caps, calculates the exact refund for every unallocated unit, and fingerprints the queue plus available inventory. PostgreSQL rejects a stale confirmation. The allocation is staged transactionally, HitPay receives idempotent shortfall refunds, and finalization creates a paid order only for the allocated quantity. A zero allocation becomes a fully refunded preorder.

### Orders and payments

Orders use retail channel `b2c`. Normal-order payments use kind `full`. HitPay webhook events are deduplicated through `webhook_events`, and payment functions validate amount, currency, order state, and reservation deadline before changing inventory or order state.

Preorder payments also use kind `full`. The former deposit/balance collection endpoint and balance-payment transition are not part of the active application.

Manual-invoice checkout, wholesale credit, wholesale pricing tiers, and B2B account tables were removed by `20260716213000_remove_wholesale_b2b.sql`.

### Customer-owned data

Customers own their account, orders, preorders, payments, shipments, notifications, and waitlist entries. Commercial writes remain server-side so state transitions and stock checks cannot be bypassed from the browser.

### Admin operations

Catalog, product-type, SKU, pricing, image, listing, deal, inventory, purchase-order, preorder-allocation, order, refund, reconciliation, and exception changes use explicit service-role functions. Critical mutations are recorded in `audit_logs`.

Administrator coverage is stored as action-level rows in `admin_access_grant_permissions`. Roles remain provisioning templates. The UI and APIs authorize the exact permission for the owning domain, including separate `pricing.manage`, `storefront.publish`, `payments.reconcile`, and `refunds.manage` authority.

The preorder allocation workspace requires both `preorders.allocate` and `refunds.manage`. It requires an explicit confirmation after the refund impact is shown. Direct allocation API calls require the same reviewed fingerprint and permissions.

## Row-level security

RLS is enabled on customer-facing tables. Public reads are limited to active catalog data, current active prices, availability, published listings, active deals, and active storefront configuration.

Authenticated customers can read their own customer, order, preorder, payment, shipment, notification, and waitlist rows. Supply-side, authorization, and operational tables—including product types, suppliers, purchase orders, permission definitions, grant permissions, allocation rules, refunds, audit logs, webhook events, and payment exceptions—remain service-role only.
