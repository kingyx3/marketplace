# Data model

The executable source of truth is [`supabase/migrations/`](../supabase/migrations/). This document describes the active retail application model after the wholesale decommission migration.

## Entity map

```text
product_types -------------------------> products
                                          ^
tcg_categories -> sets_releases ---------+-> product_variants -> booster_box_skus
                                          |                         |
                                          -> listing_items          |
                                                                    v
     suppliers -> purchase_orders -> purchase_order_items ------> inventory

customers -> preorders --(convert)--> orders -> order_items
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

`products` and `booster_box_skus` use active/archive state rather than destructive deletion. `listing_items` stores title overrides, badges, tags, customer limits, preorder reserve, featured ordering, and publish state. Active listings are retail-only and use `channels = ['b2c']`.

`limited_time_deals` attaches time-bounded public or member offers to SKUs. Deals are presented inside Products and are revalidated during checkout.

### Inventory and purchasing

`inventory` tracks on-hand, allocated, incoming, and safety stock. Its constraints prevent allocation beyond on-hand plus confirmed incoming stock. Supplier purchase-order intake records the PO and increments incoming stock in one database transaction.

### Preorders

`preorders` stores deposit, balance, allocated quantity, and lifecycle status explicitly. Retail allocation is FIFO with optional per-customer caps. Balance-payment success converts an allocated preorder into one paid order idempotently.

### Orders and payments

Orders use retail channel `b2c`. Payments distinguish `deposit`, `balance`, and `full`. Stripe webhook events are deduplicated through `webhook_events`, and payment functions validate amount and currency before changing inventory or order state.

Manual-invoice checkout, wholesale credit, wholesale pricing tiers, and B2B account tables were removed by `20260716213000_remove_wholesale_b2b.sql`.

### Customer-owned data

Customers own their account, orders, preorders, payments, shipments, notifications, and waitlist entries. Commercial writes remain server-side so state transitions and stock checks cannot be bypassed from the browser.

### Admin operations

Catalog, product-type, SKU, image, listing, deal, inventory, purchase-order, preorder-allocation, order, refund, reconciliation, and exception changes use explicit service-role functions. Critical mutations are recorded in `audit_logs`.

## Row-level security

RLS is enabled on customer-facing tables. Public reads are limited to active catalog data, availability, published listings, active deals, and active storefront configuration.

Authenticated customers can read their own customer, order, preorder, payment, shipment, notification, and waitlist rows. Supply-side and operational tables—including product types, suppliers, purchase orders, allocation rules, refunds, audit logs, webhook events, and payment exceptions—remain service-role only.
