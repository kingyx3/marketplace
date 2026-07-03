# 01 — Market landscape

## US/global benchmark players

**TCGplayer** is the dominant US marketplace for singles and sealed
product, now owned by Fanatics. It is a marketplace model, not a
retailer: individual sellers (from big LGSs to individuals) list
inventory, and TCGplayer takes a commission + transaction fee on every
sale (10.75% commission, 2.5–3.5% + $0.30 transaction fee, plus a 2%
international PayPal payout fee capped at $20 — **[S9]**, full detail
in [§12](12-financial-model.md)). TCGplayer also publishes a monthly
"Top 25 Sealed Products" chart tracked by industry press **[S4] [S6]**
— this chart is a genuinely useful proxy for demand and price momentum
across the whole sealed-product category, not just MTG, and is worth
monitoring operationally (see [§11](11-go-to-market.md)).

**Star City Games (SCG), Card Kingdom, ChannelFireball** are
vertically-integrated MTG retailers: they buy sealed product at
distributor/publisher terms, hold real inventory, and sell direct to
consumers with their own pricing, content (strategy articles, event
coverage), and loyalty/rewards programs. Their moat is largely content
and community trust built over 15–20+ years, not fulfillment
technology — a new entrant cannot out-content them quickly, but can
out-execute them on a narrower, better-designed pre-order/allocation
flow (their sites, while functional, are not purpose-built for a clean
deposit-then-balance pre-order UX).

**Troll and Toad, DACardWorld** are broader hobby/collectibles
retailers selling sealed product alongside singles, toys, and other
collectibles — high SKU breadth, lower per-category specialization.

**Distributors (GTS Distribution and peers such as Southern Hobby /
Magazine Exchange-style wholesalers)** sit between publishers and
retailers. GTS's own published onboarding terms are a useful proxy for
the category's wholesale norms: a gated application (pre-screening
survey, signed application, resale certificates), real order minimums
enforced via shipping-cost thresholds (free shipping starts at
US$750/warehouse, scaling to US$1,600 for three warehouses with
US$200 minimums each), no default credit terms for new accounts
(credit-card-only until approved, 18% p.a. on balances >21 days past
due), and an explicit, contractual right to allocate scarce product
among customers at any time **[S3]**. Any new B2B sourcing plan should
assume these are *typical* distributor terms, not outliers.

**Amazon** carries sealed product from third-party sellers and (for
some SKUs) directly; it competes mostly on convenience/Prime shipping
and is a channel worth listing on for reach, not a strategy.

## Singapore / Southeast Asia layer

**Maxsoft Pte Ltd** is a confirmed Singapore-based distributor for
Pokémon TCG, One Piece Card Game, Digimon Card Game, Union Arena, and
Dragon Ball Super Fusion World — the Bandai/TPCi side of the market —
and is separately Nintendo's official Southeast Asia distributor
**[S7]**. It does **not** carry MTG, Yu-Gi-Oh!, Lorcana, or Flesh and
Blood per its own published lineup **[S7]**; those games need a
different sourcing route (see [§4](04-supplier-distribution.md)).

**Regional marketplaces (Shopee, Lazada, Carousell)** are the dominant
consumer discovery and transaction channels in SEA retail generally,
including for TCG sealed product and singles resold peer-to-peer.
Carousell in particular functions as a large informal secondary market
for singles and sealed boxes in Singapore. Current commission/fee
schedules for these platforms should be pulled live before modeling
(**[S12]**, **[S13]**) — this report did not independently verify their
current rates.

**Singapore GST** applies to e-commerce exactly as it applies to
offline retail: standard-rated for domestic delivery, zero-rated for
documented exports, with a separate "low-value goods" (≤S$400)
overseas-vendor regime that can make an electronic marketplace operator
(not the individual seller) responsible for charging GST on qualifying
imported goods sold through it **[S8]**. See [§13](13-risks-mitigations.md)
for the registration-threshold implications.

## Pre-order demand is real and measurable

ICv2's reporting on the 2023 Magic: The Gathering — Lord of the Rings
Universes Beyond release is the clearest evidence available that
pre-order interest on a marquee sealed SKU can be extreme: the
Collector Booster Box reached #2 on TCGplayer's Top 25 Sealed Products
chart *almost four months before release*, on pre-orders alone, with
the last comparably strong pre-order showing being Commander Legends in
2020 — i.e., this level of advance demand is exceptional, not typical,
and should not be assumed for every set **[S4]**. In the same reporting
period, Pokémon's Scarlet & Violet line took 4 of the top 25 slots
(including #1) and One Piece Card Game had been charting continuously
since its English launch — evidence that a multi-game assortment,
not an MTG-only catalog, captures more of the category's demand
**[S4]**.

## Post-release price behavior is volatile

Independent tracking of TCGplayer's October 2020 Top 25 Sealed
Products found that 18 of 25 tracked products *lost* value within about
a month — sealed product commonly depreciates shortly after release,
which is the mechanical reason pre-order/near-release is the highest-
value selling window **[S6]**. The same dataset shows the two failure
modes a booster-box business must plan for in both directions:
MTG Zendikar Rising Collector/Set Boosters fell 21%/23% in a month (an
unusually steep drop for a fall Standard set) **[S6]**, while Pokémon
Vivid Voltage (+35%) and XY Evolutions (+165%, driven by chase-card
demand for a Holo Rare Charizard) appreciated sharply on the same chart
in the same window **[S6]**. Both outcomes are real; neither should be
the base-case assumption for inventory planning (see
[§13](13-risks-mitigations.md)).
