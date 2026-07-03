# 05 — Customer segmentation

Five segments, drawn from how demand actually shows up across the
sources reviewed (ICv2's coverage of who drives Top-25 sealed movement
**[S4] [S6]**, and general category structure corroborated by
distributor/publisher retailer-policy documents **[S1] [S2] [S3]**).

## 1. Players

**Who:** buy sealed product to open and play — draft/sealed events,
deck-building, casual play. **Behavior:** price-sensitive but
loyalty-driven; will return to a seller who reliably has stock at
launch and treats them fairly on allocation. **Price sensitivity:**
high on staple/Standard-format product, lower on niche formats they're
personally invested in (Commander precons, format-specific sets).
**Channels:** LGS in-person first where one exists; online for
convenience, restocks, or when local supply runs out. This segment
directly benefits from — and is a proof point for — the
allocation-rules system (they're the ones who get frustrated by opaque
"sold out in 2 minutes" experiences).

## 2. Collectors

**Who:** buy sealed product to keep sealed (long-term hold or display),
often chasing specific sets, art, or Collector Booster-tier product.
**Behavior:** will pay a premium for guaranteed allocation on marquee
releases (the LotR Collector Booster pre-sale premium in **[S4]** is
largely collector-driven demand). **Price sensitivity:** lower than
players on the specific SKUs they want; very price-sensitive on
anything they see as fungible. **Channels:** pre-order-first — this
segment is the primary reason a deposit/allocation system matters more
than a simple in-stock/out-of-stock cart.

## 3. Investors / "flippers"

**Who:** buy sealed product speculatively, betting on post-release
price appreciation (per the XY Evolutions +165% and Vivid Voltage +35%
cases **[S6]**) or arbitraging price differences between markets/
channels. **Behavior:** highly price- and allocation-sensitive; will
try to game per-customer purchase limits with multiple accounts.
**Price sensitivity:** extreme — margin is the entire point.
**Channels:** wherever allocation is loosest; the segment most likely
to strain a per-customer cap policy (`allocation_rules.max_per_customer`
in the schema exists specifically to blunt this).

## 4. Resellers (non-LGS)

**Who:** individuals or small operations buying in bulk to resell,
often via Carousell/Shopee-style marketplaces, without operating a
storefront. **Behavior:** price-driven, order in whatever quantity a
B2B tier's minimum allows, low brand loyalty. **Price sensitivity:**
extreme, but tolerant of slightly higher unit cost if minimum order
quantities are low (easier entry than qualifying for a "real"
distributor account). **Channels:** wholesale tier of the business's
own web app if one exists; otherwise buys from whoever will sell to
them in case quantities.

## 5. LGS buyers (other stores)

**Who:** owners/buyers at other brick-and-mortar or online game stores
restocking sealed product, often to supplement their primary
distributor relationship or to fill gaps when a set is on allocation
upstream. **Behavior:** relationship-driven, cares about reliability of
supply and payment terms as much as price; genuinely useful long-term
B2B accounts if treated well (per `b2b_accounts.approved` +
`pricing_tiers` in the schema — see [§9](09-data-model.md)).
**Price sensitivity:** moderate — willing to pay above rock-bottom
wholesale for supply reliability, especially on allocated/hot sets.
**Channels:** direct relationship (email/WhatsApp/Telegram initially,
then the B2B portion of the web app as volume grows).

## Segment priority for launch

1. **Players + collectors** via the pre-order flow — highest near-term
   volume and the clearest product-market fit for the deposit/
   allocation system (see [§7](07-preorder-workflow.md), [§11](11-go-to-market.md)).
2. **LGS buyers** as B2B accounts once there's proven, reliable
   sourcing — a small number of high-trust relationships beats many
   low-trust reseller accounts.
3. **Resellers/investors** are demand that will show up regardless;
   design allocation rules (per-customer caps, channel reserves) to
   cap how much of scarce supply they can absorb, protecting the
   players/collectors the brand is actually trying to serve.
