# 10 — Operations

## Receiving

Every inbound shipment against a `purchase_order` should be checked
against `purchase_order_items.quantity` before `received_quantity` is
updated and stock moves from `incoming` to `on_hand` — this is the
point at which allocation actually becomes possible to fulfill
(see [§07](07-preorder-workflow.md)). Given distributors reserve the
right to allocate/short an order at any time **[S3]**, receiving is
also the first point the business will discover a shortfall against
what was promised to pre-order customers — the allocation-result
notification (§07) should be timed to *after* receiving is confirmed,
not before.

## Storage: sealed product care

Sealed booster boxes are moisture- and crush-sensitive, and value is
tied directly to the box being genuinely unopened/undamaged (relevant
both to collector demand — [§05](05-customer-segmentation.md) — and to
avoiding customer disputes). Baseline practice: climate-controlled,
dry storage away from direct sunlight (UV fading affects box art
value to collectors); boxes stored upright as printed, not stacked
under heavy weight for extended periods; FIFO shelf rotation by
`sets_releases.release_date` to avoid inadvertently shipping older
stock that's been sitting longest (relevant given sealed prices move
fast post-release in both directions — [§01](01-market-landscape.md)).

## Packing standards

A booster box shipped without adequate protection arrives crushed at
the corners often enough that most established sealed-product sellers
double-box or use rigid inserts rather than shipping in the
manufacturer's shrink-wrap alone inside a plain mailer. Minimum bar for
this business: correctly sized outer box (no more than ~1 inch of
give), corner/edge protection, and — for higher-value Collector
Booster-tier product — a tamper-evident seal on the outer packaging as
part of the authenticity commitment identified in
[§04](04-supplier-distribution.md)/[§13](13-risks-mitigations.md).

## Shipping carriers, damage, and insurance

For Singapore/SEA, the practical carrier set is SingPost (domestic and
some international), and regional courier/logistics providers such as
Ninja Van and J&T Express for SEA parcel delivery, plus DHL/FedEx for
higher-value or international shipments needing tracked, insured
service. (`shipments.carrier` in the schema is a free-text field
precisely because the right carrier varies by destination and box
value — this is intentionally not a hardcoded enum.) Declare accurate
value and purchase carrier insurance on any shipment where the box
value materially exceeds the carrier's default liability coverage —
sealed Collector Booster boxes in particular can be worth several
times a standard Play Booster box.

## Returns

Given FaB's explicit rule that sealed product may only be sold online
by qualifying brick-and-mortar stores in the first place **[S2]**, and
that MTG/FaB/most TCG publishers do not support consumer-initiated
returns of *opened* sealed product (once opened, a box's collector/
resale value is gone), the practical returns policy for this category
is narrow: **damaged-in-transit or materially defective (factory
sealed-but-wrong-contents) only**, evidenced by photos before opening,
resolved via replacement or refund funded by carrier insurance claims
where applicable — never a general change-of-mind return window on
sealed product, which would expose the business to customers extracting
value (checking contents, then returning) at direct cost to sellable
inventory value.

## What's not built yet operationally

Warehouse management beyond the `inventory`/`location` columns already
in the schema, carrier-rate-shopping integration, and formal insurance-
claim tracking are all roadmap items (`docs/build-plan.md` Phase 4) —
appropriate for a business past the "sell the first box" MVP stage
described in [§14](14-final-recommendation.md), not before.
