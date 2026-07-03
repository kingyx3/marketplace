# Data model

Source of truth: [`supabase/migrations/`](../supabase/migrations/).
Narrative rationale here; the research-report version (why the business
needs these shapes) is `docs/research/09-data-model.md`.

## Entity map

```
tcg_categories ─▶ sets_releases ─▶ products ─▶ product_variants ─▶ booster_box_skus
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
```

## Key decisions

**Money is integer cents + currency code.** No floats anywhere. Default
currency `SGD`; multi-currency is a column, not a refactor.

**Pre-orders carry deposit/balance explicitly.** `preorders` has
`deposit_cents` and `balance_cents`, and `payments.kind` distinguishes
`deposit` / `balance` / `full`. This models the standard TCG pre-order
pattern (deposit at announcement, balance at allocation) without
inventing partial-payment logic on orders. A fulfilled pre-order is
*converted* into an order (`preorders.order_id`), so fulfillment,
shipping, and refunds all live in one place.

**Oversell guard is a database constraint.** `inventory` tracks
`on_hand`, `allocated`, and `incoming` with
`check (allocated <= on_hand + incoming)` and a generated `available`
column. Pre-orders may be taken against confirmed incoming stock, but
the constraint makes overselling a transaction failure rather than a
support ticket.

**Allocation is data, not code branches.** `allocation_rules` (priority,
channel, reserve quantity, per-customer cap) drives who gets scarce
stock — e.g. "reserve 8 boxes for B2C at max 2/customer; B2B takes the
rest FIFO". The pure engine in `lib/allocation.ts` mirrors this and is
unit-tested; the seed ships a working example.

**B2B is an approval layer on customers.** Any customer can *apply* for
a `b2b_accounts` row; only `approved` accounts see wholesale pricing via
`pricing_tiers` (basis-point discounts + minimum order). Pricing tiers
are M:N so a customer can hold e.g. a regional tier and a promo tier.

**Audit by trigger.** `audit_logs` is written by a generic trigger on
the money/stock-critical tables (inventory, orders, preorders, payments,
refunds, allocation_rules, b2b_accounts). Nobody has to remember to log.

**Webhook idempotency is a table.** `webhook_events` has
`unique (provider, event_id)`; the Stripe route inserts before
processing and treats a duplicate-key error as "already handled".

## Row-level security

RLS is enabled on **every** table:

- Catalog (`tcg_categories` → `booster_box_skus`) and `inventory`
  availability: public read.
- `customers`, `preorders`, `orders`, `order_items`, `payments`,
  `shipments`, `b2b_accounts`, `notifications`: customers read their own
  rows via `auth.uid()`; all writes go through the service role so state
  machines and stock checks stay server-side.
- Supply-side tables (`suppliers`, `purchase_orders`, `pricing_tiers`,
  `allocation_rules`, `refunds`, `audit_logs`, `webhook_events`): no
  anon/authenticated policies at all — service role only.
