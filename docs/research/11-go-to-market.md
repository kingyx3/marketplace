# 11 — Go-to-market

## Launch strategy

Lead with **one well-chosen pre-order**, not a full catalog launch.
Given pre-order demand concentrates heavily on specific high-anticipation
releases (the LotR Collector Booster case ranked #2 on TCGplayer's
Top 25 almost four months pre-release **[S4]**), the first-mover
advantage in this business is choosing the right SKU to launch on and
executing the deposit/allocation/communication flow ([§07](07-preorder-workflow.md))
visibly better than the fragmented Shopee/Carousell-listing alternative
([§02](02-competitive-benchmarking.md)) — not trying to stock every set
across six games simultaneously.

## Community building

The player/collector segments in [§05](05-customer-segmentation.md) are
communities, not just customers — TCG buying decisions are heavily
social (deck-building group chats, local meta discussion, "is this set
worth pre-ordering" debate). Discord and Telegram are the two channels
worth building presence in for a SEA-facing TCG business specifically:
Telegram is broadly used across SEA for exactly this kind of
merchant-community interaction (order updates, restock alerts), and
Discord is the default hub for competitive-play communities globally.
Both should be tied into the notification system (`lib/notifications.ts`
now implements Telegram and WhatsApp drop-alert providers) so allocation
results and restock alerts land where the audience already is, rather
than relying on email alone.

## Content

Content is the moat Star City Games/ChannelFireball have built over
15+ years and this business cannot replicate quickly
([§02](02-competitive-benchmarking.md)) — so content strategy here
should be narrow and operational rather than trying to out-produce
established strategy sites: set-preview/"is this worth pre-ordering"
posts timed to each set's `preorder_open_at`, plain-language allocation-
policy explainers (the trust-building differentiator from
[§02](02-competitive-benchmarking.md)), and post-mortem transparency
after every allocation event ("here's what we got, here's how it was
split"). This is cheap to produce and directly reinforces the
pre-order-experience differentiation, rather than competing head-on for
generic strategy-content traffic.

## Marketplace presence vs. own-site

**Both, deliberately weighted toward own-site for margin-bearing
transactions.** List on Shopee/Lazada/Carousell for discovery and reach
— these platforms already have the region's consumer trust and
traffic — but treat marketplace listings as a funnel to the owned site
for anything pre-order/allocation-driven, since marketplace commission
structures (TCGplayer's 10.75%+2.5–3.5%+$0.30 as the clearest published
benchmark **[S9]**; SG marketplace rates should be checked live —
**[S12] [S13]**) compress an already-thin sealed-product margin, and
none of these marketplaces support a native deposit/balance/allocation
flow at all. A useful heuristic: marketplace for one-off/overstock
sales, own-site for anything pre-order.

## Sequencing

1. **Pre-launch (before first pre-order opens):** community presence
   (Discord/Telegram) live, first set-preview content published,
   allocation policy publicly documented.
2. **First pre-order:** the proof point — execute the deposit →
   allocation-result → balance → ship flow visibly and reliably on one
   well-chosen set.
3. **Post-first-pre-order:** publish the allocation post-mortem, use it
   as the case study/trust signal for the next pre-order and for
   opening the first B2B conversations with LGS buyers
   ([§05](05-customer-segmentation.md)).
4. **Ongoing:** marketplace listings for reach once there's inventory
   depth beyond active pre-orders; B2B outreach once fulfillment
   reliability is proven.

Full launch metrics and timeline: [§14](14-final-recommendation.md).
