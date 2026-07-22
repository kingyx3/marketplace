# 09 — Data model requirements

This section is the business narrative behind the schema actually
implemented in `supabase/migrations/20260703000001_initial_schema.sql`;
see `docs/data-model.md` for the technical/RLS reference. The point
here is *why* each requirement exists, traced back to the preceding
research sections.

## Catalog: category → set → product

Three levels keep the business model explicit without creating duplicate sellable identities:
a **category** (MTG, Pokémon, One Piece — the
multi-game assortment identified as a differentiator in
[§02](02-competitive-benchmarking.md)) contains **sets/releases** (each
with its own pre-order window — `preorder_open_at`/`preorder_close_at`
— because pre-order timing is set-specific, not category-wide, per the
LotR case study **[S4]**), which contain **products** (a set has a
booster box, a collector box, a bundle, or a language/printing-specific item — each with
different economics). The product is the sellable, priced, and inventoried unit; external
catalog variant identifiers remain source metadata. See ADR 0001.

## Inventory: on_hand / allocated / incoming, with an oversell guard

Directly modeled on the reality that distributors themselves allocate
scarce supply contractually **[S3]** — this business will sometimes
sell against *confirmed incoming* stock (a pre-order) before that stock
physically arrives, which is exactly the scenario that makes oversell a
real risk without a database-level guard. `check (allocated <= on_hand
+ incoming)` turns a potential customer-facing failure (promising more
boxes than will ever exist) into an immediate transaction rejection.

## Suppliers, purchase orders, purchase order items

Modeled because sourcing is genuinely multi-supplier from day one per
[§04](04-supplier-distribution.md) — at minimum, one regional
distributor route (Maxsoft-style, no brick-and-mortar gate) and,
eventually, an LGS-partnership route for MTG/FaB. `suppliers.payment_terms`
and `min_order_cents` exist because real distributor terms include
exactly these constraints (GTS: shipping-threshold minimums, no default
credit terms for new accounts **[S3]**).

## Customers, B2B accounts, pricing tiers

Every segment in [§05](05-customer-segmentation.md) is a `customers`
row; only the **LGS buyers / resellers** segment additionally becomes a
`b2b_accounts` row, and only after `approved = true` unlocks
`pricing_tiers` — mirroring how every real wholesale account reviewed
in this report (WPN, FaB, GTS) is an *application-then-approval*
process, never instant self-serve **[S1] [S2] [S3]**.

## Preorders with deposit/balance, converting to orders

Directly implements the deposit-then-balance design from
[§07](07-preorder-workflow.md): `preorders.deposit_cents` +
`balance_cents`, a `status` state machine (`pending_deposit` →
`deposited` → `allocated` → `balance_due` → `paid` → `converted`), and
a nullable `order_id` set only at conversion — so a pre-order that
never gets allocated never becomes a phantom order.

## Allocation rules as data, not code branches

The single most direct translation of a research finding into schema:
because every real distributor in this report treats allocation as a
standing contractual mechanism, not an exception process **[S3]**, this
business's own allocation policy needed to be **queryable, auditable
data** (`allocation_rules`: priority, channel, reserve_quantity,
max_per_customer) rather than a one-off decision made in a support
ticket. `lib/allocation.ts` implements and unit-tests the exact engine
that consumes this table.

## Payments, refunds, webhook idempotency

`payments.kind` (`deposit`/`balance`/`full`) exists because the
deposit/balance design in [§07](07-preorder-workflow.md) requires more
than one payment event per pre-order. The `webhook_events` idempotency
ledger exists because Stripe webhooks can be delivered more than once
by design — a payment state machine this important cannot afford to
double-process an event (see `docs/security.md`).

## Shipments and audit logs

`shipments` tracks carrier/tracking against the operational reality in
[§10](10-operations.md) (multiple SEA couriers, damage/insurance
tracking). `audit_logs`, written by trigger on every money/stock-
critical table, exists because a business handling pre-payment on
scarce, sometimes-allocated, sometimes-refunded inventory needs a
provable record of every state change — both for the business's own
dispute resolution and for the trust/transparency commitment identified
as a differentiator in [§02](02-competitive-benchmarking.md).
