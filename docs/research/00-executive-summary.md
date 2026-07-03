# 00 — Executive summary

## The business

Sealed TCG booster boxes — mainly Magic: The Gathering, with Pokémon
TCG, Yu-Gi-Oh!, One Piece Card Game, Disney Lorcana, and Flesh and
Blood as an assortment layer — sold through three channels: B2C retail
(single boxes to players/collectors), B2B/wholesale (case-quantity to
other stores and resellers), and pre-orders (deposits taken ahead of a
set's street date). Region: Singapore/SEA-first, benchmarked against
the mature US market.

## What the research found

1. **Wholesale access is gated by physical retail, not by having a
   website.** WPN (MTG) **[S1]**, Legend Story Studios (FaB) **[S2]**,
   and GTS Distribution's account terms **[S3]** all require or
   strongly favor a brick-and-mortar location. A pure web-app business
   cannot become an authorized MTG or FaB distributor account on day
   one. This is the single most important constraint in the whole
   report — see [§4](04-supplier-distribution.md).

2. **Sealed product is a thin, volume-dependent margin business at
   retail.** A practitioner estimate puts sealed-box gross margin at
   roughly 15–20% versus 45%+ on singles **[S15]** — sealed boxes exist
   to drive traffic and organized play, not as the profit center, for
   most brick-and-mortar LGS operators. Historical WPN pricing data
   (~2011, illustrative of structure not current numbers) shows a
   roughly 50%-off-MSRP wholesale tier for the best-connected stores and
   a meaningfully worse rate (+US$8–10/box) for everyone buying through
   ordinary distribution **[S5]**.

3. **Pre-orders are where the real margin and cash-flow advantage
   lives.** ICv2's read of the 2023 Lord of the Rings Collector Booster
   launch shows wholesale cost (~US$280) against pre-sale retail
   (~US$434.80) — roughly 55% markup captured *before* the box ever
   ships **[S4]**, and pre-order demand on a marquee set can rank among
   the highest-velocity SKUs on the largest US TCG marketplace months
   before release **[S4]**. This is the commercial case for the
   deposit/allocation system built into this repo's schema
   (`preorders`, `allocation_rules` — see [§9](09-data-model.md)).

4. **Sealed prices move fast, in both directions, right after
   release.** Independent TCGplayer sealed-price tracking found 18 of
   25 top sealed products lost value within a month of a given release
   window, with some MTG Standard product crashing >20% — but select
   Pokémon product on the same chart *rose* up to 165% on chase-card
   demand **[S6]**. Inventory risk is real and asymmetric: mispriced
   pre-orders or slow-moving stock on the wrong set can lose money fast;
   the upside cases are real but not the base case.

5. **GST and platform fees are modelable, not blockers.** Singapore GST
   treats online sales the same as offline (standard-rated domestic,
   zero-rated exports with documentation) **[S8]**; the S$1M
   registration threshold gives real runway before mandatory
   registration. US benchmark marketplace fees (TCGplayer: 10.75%
   commission + 2.5–3.5% + $0.30 transaction fee **[S9]**) show why
   owning the storefront (own web app) rather than only selling on a
   marketplace materially protects margin on a low-margin product
   category.

## The recommendation, one paragraph

Don't try to become a WPN/FaB-authorized *distributor account* from a
standing start online — that route is structurally closed without a
physical store. Instead: (a) source Pokémon/One Piece/Bandai-line
sealed product through a regional SEA distributor such as Maxsoft
**[S7]**, which has no brick-and-mortar gate; (b) for MTG/FaB, either
partner with an existing LGS as a fulfillment/pre-order channel, or
plan a lightweight physical presence (a small unit, pop-up, or
convention booth satisfying the minimum criteria in **[S2]**) once
volume justifies it; (c) build the differentiation on the *pre-order
and allocation experience* — the thing platforms like Shopee/Carousell
listings do badly and generic Shopify themes don't model at all — using
exactly the deposit/balance/allocation-rules data model already
scaffolded in this repo. Full reasoning: [§14](14-final-recommendation.md).
