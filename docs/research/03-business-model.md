# 03 — Business model options

## The models

| Model | Description | Typical margin | Inventory risk | Cash-flow profile |
| --- | --- | --- | --- | --- |
| **Pure B2C retail** | Buy sealed boxes, hold stock, sell to end consumers at/near MSRP | Thin: a practitioner estimate puts sealed gross margin at ~15–20% (a $100 box nets $15–20) **[S15]** | High — you own the depreciation risk of unsold boxes (see [§01](01-market-landscape.md) on 18/25 products losing value in a month **[S6]**) | Cash tied up in inventory ahead of sales; slow if sell-through is weak |
| **B2B/wholesale** | Sell case quantities to other stores/resellers at a wholesale discount | Lower margin per unit than B2C, but no per-unit marketing/fulfillment cost and higher velocity | Lower per-unit risk (fast turnover) but concentration risk if a few accounts represent most volume | Best cash-flow model if paired with short payment terms or prepayment; worst if you extend credit you can't collect |
| **Hybrid (B2C + B2B)** | Run both books; B2C funds marketing/brand, B2B funds volume | Blended — depends on channel mix | Diversified — a B2B account's inventory issue doesn't sink the whole business | Two working-capital needs to plan for, but two demand sources smoothing seasonality |
| **Pre-sale-driven** | Take deposits before or at set announcement; ship at/after street date | Best margin capture: ICv2's LotR data shows ~55% markup from distributor cost (~US$280) to pre-sale retail (~US$434.80) **[S4]** | Lowest inventory risk of any model — you're not holding unsold stock speculatively, only what's already pre-sold (plus a small buffer) | **Best cash-flow model**: deposits arrive before you pay the distributor invoice, effectively financing the purchase with customer money (subject to the deposit/refund design in [§7](07-preorder-workflow.md)) |
| **Subscription / box-break** | Recurring box club, or selling shares in a case opened live/on-stream | Can be high-margin per unit sold (bundles hype + product), but requires ongoing content/entertainment production, not just fulfillment | Concentrated on whichever set is being broken — a bad pull rate or slow-selling set stalls the model | Recurring revenue is attractive but requires sustained content output; not a pure logistics play |
| **Community/LGS-partnered** | Partner with an existing brick-and-mortar store: use their WPN/FaB retailer status and physical space, run the online pre-order/allocation layer yourselves | Margin shared with the LGS partner, but unlocks distributor-tier wholesale pricing this business cannot get alone **[S1] [S2]** | Shared — the partner absorbs some but not all risk depending on the deal structure | Depends entirely on the partnership terms negotiated |

## Reading the margin data honestly

Two data points anchor sealed-product margin expectations, and they are
in tension by design — one is a *retail LGS* margin (what a store nets
selling one box off the shelf), the other is a *pre-sale spread*
(distributor cost to pre-sale price):

- **~15–20% gross margin** is what a brick-and-mortar store nets
  selling sealed product at or near MSRP to walk-in customers, per a
  practitioner (LGS-owner) estimate **[S15]** — this is the "sealed
  product funds the lights, singles fund the profit" reality most LGS
  operators describe.
- **~55% markup** is achievable specifically in the pre-sale window on
  a high-demand set, per ICv2's LotR Collector Booster case (distributor
  ~US$280 → pre-sale ~US$434.80) **[S4]** — but this is a documented
  *high-demand outlier* (the article itself frames LotR as exceptional
  pre-order performance, comparable only to Commander Legends in 2020
  **[S4]**), not a typical-set baseline.

**Implication for model choice:** a pre-sale-driven or hybrid model
captures meaningfully more margin *on hit sets* than passive B2C
shelf-selling, but the margin compresses toward the 15–20% range on
ordinary sets sold after release, once initial hype has faded and price
discovery (often downward — [§01](01-market-landscape.md)) has occurred.
Treat 55% as an upside case to plan marketing around, and 15–20% as the
floor to build unit economics on (see [§12](12-financial-model.md)).

## Historical structural anchor: tiered wholesale pricing

A ~2011 MTGSalvation forum discussion, while dated, is a useful
illustration of *structure* that still generally holds: WPN "Premier"
stores buying direct from Wizards of the Coast paid roughly 50% off
MSRP, while non-Premier stores buying through ordinary distribution
paid an additional US$8–10 per box on top of the Premier rate — and
Premier-tier access itself required a real storefront, hosting
sanctioned play, and an approval process **[S5]**. The specific dollar
figures are 15 years stale; the *shape* (best pricing gated behind
physical-store status; everyone else pays a distributor markup on top)
is corroborated by current WPN and FaB retailer policy documents
**[S1] [S2]** and should be assumed to still hold directionally.

## Recommended model for this business

**Pre-sale-driven, hybrid B2C+B2B, with a community/LGS-partnered
sourcing bridge for MTG.** Concretely:

1. Lead with pre-orders on the SKUs where a distributor relationship is
   achievable without brick-and-mortar status (Pokémon/One Piece/Bandai
   lines via a route like Maxsoft — **[S7]**), capturing pre-sale
   margin from day one.
2. Layer B2B on top once volume exists — sell case quantities to
   smaller resellers/LGS at a defined discount tier (mirrors
   `pricing_tiers` in the schema).
3. Solve MTG/FaB supply via an LGS partnership rather than trying to
   qualify as a distributor account directly — see
   [§4](04-supplier-distribution.md) and [§14](14-final-recommendation.md)
   for the concrete path.
4. Treat subscription/box-break as a *later* content-driven add-on, not
   the core model — it requires production capability this scaffold
   doesn't build for in v1 (tracked as not-built in
   `docs/build-plan.md`).
