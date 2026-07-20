# 06 — Ideal website/web-app feature set

Derived from the market gaps in [§02](02-competitive-benchmarking.md)
and the segments in [§05](05-customer-segmentation.md). Each feature is
marked against whether it exists in the current scaffold or is
roadmap (`docs/build-plan.md` is the authoritative status list — this
section is the _rationale_, not a duplicate status tracker).

## Core catalog & discovery

- Browse by game (MTG/Pokémon/etc.), set, and product type (booster
  box, collector box, bundle, case) — modeled by `tcg_categories` →
  `sets_releases` → `products` → `product_variants` → `booster_box_skus`.
- Clear release/pre-order status per set (announced / pre-order open /
  pre-order closed / released / out of print) — `sets_releases.status`.
- Search across name/description — Postgres full-text to start
  (see [§08](08-technical-implementation.md) for the upgrade path).

## Pre-order-native checkout (the differentiator)

- Deposit-now, balance-later checkout distinct from a normal add-to-cart
  flow — because none of the incumbent SEA channels model this
  natively ([§02](02-competitive-benchmarking.md)).
- Visible, plain-language allocation policy on scarce SKUs ("we reserve
  N units for direct customers, capped at 2 per customer; remainder
  goes to wholesale") rather than silent sell-outs.
- Order/pre-order status page: deposited → allocated → balance due →
  paid → shipped, mapped straight to `preorders.status`.

## Account & tiering

- Customer accounts (Supabase Auth) with order/pre-order history.
- A B2B application path that leads to `b2b_accounts.approved` and
  unlocks `pricing_tiers` — self-serve application, human approval
  (mirrors how every real distributor account in [§04](04-supplier-distribution.md)
  works: application then gated approval, not instant signup).

## Trust & transparency

- Sourcing/authenticity statement addressing the grey-market/
  counterfeit concern from [§04](04-supplier-distribution.md) and
  [§13](13-risks-mitigations.md) directly on product and FAQ pages.
- Clear refund/cancellation policy for pre-orders, especially for the
  allocation-cut scenario ([§07](07-preorder-workflow.md)).

## Notifications

- Multi-channel (email first, then Telegram/WhatsApp/SMS — the
  audience for this category in SEA is heavily Telegram/WhatsApp-native)
  for: pre-order confirmed, allocation result, balance due, shipped.
  Provider-agnostic interface lives in `lib/notifications.ts`; Resend
  email and Telegram/WhatsApp restock alerts are implemented, with SMS
  still feature-gated.

## Admin / operator surface (not customer-facing, but required to run

the business)

- Inventory view against `inventory.on_hand/allocated/incoming` with
  the oversell guard enforced at the database level.
- Purchase order intake tied to `purchase_orders`/`purchase_order_items`
  updating `incoming` stock.
- An allocation "run" action that applies `allocation_rules` against
  pending `preorders` when confirmed stock arrives (the `lib/allocation.ts`
  engine already implements and unit-tests this logic; wiring it to
  real inventory events is roadmap — see `docs/build-plan.md` Phase 2).

## Explicitly out of scope for v1

A full marketplace/consignment layer for singles (this business is
sealed-product-first per the recommendation in [§14](14-final-recommendation.md)),
and a subscription/box-break content platform (requires production
capability beyond an e-commerce app — see [§03](03-business-model.md)).
