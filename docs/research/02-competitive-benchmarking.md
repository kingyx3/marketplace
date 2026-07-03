# 02 — Competitive benchmarking

## Comparison table

| Player | Model | Channel | Pricing posture | Pre-order practice | Strength | Weakness / gap |
| --- | --- | --- | --- | --- | --- | --- |
| TCGplayer | Marketplace (many sellers) | US/global, ships internationally | Market-driven per listing | Sellers set their own; platform doesn't manage deposits | Liquidity, price discovery, huge catalog | Buyer trusts the *marketplace*, not any one seller; 10.75%+2.5–3.5%+$0.30 fees compress seller margin **[S9]** |
| Star City Games / Card Kingdom / ChannelFireball | Vertically-integrated retailer | US-centric, ships internationally | List/near-MSRP, own promotions | Standard pre-order with card charged near order time (typical industry norm; not independently verified per-retailer in this pass) | 15–20 years of content + community trust | Legacy web stacks; pre-order UX is generic e-commerce, not deposit/allocation-native |
| GTS Distribution & peer distributors | B2B wholesale only | Retailers/distributors, not consumers | Distributor cost | N/A (they supply the retailers who pre-sell) | Deep catalog, real supply chain | Brick-and-mortar-gated account approval; real order minimums; allocation risk passed straight to the retailer **[S3]** |
| Amazon (3P sealed sellers) | Marketplace + some 1P | Global | Often at/near MSRP, high trust | Rare — not a pre-order-native platform | Prime shipping, buyer trust | No category specialization; no allocation/community layer |
| Maxsoft (SG) | Regional distributor | SG/SEA, Pokémon/One Piece/Bandai lines | Distributor cost | N/A (supplies stores) | No brick-and-mortar gate found; regional logistics via Nintendo distribution **[S7]** | Doesn't cover MTG/Yu-Gi-Oh!/Lorcana/FaB **[S7]** |
| Shopee / Lazada / Carousell listings | Marketplace / classifieds | SG/SEA consumers | Wide variance, often below MSRP (grey-market/parallel import common) | Rare, informal | Reach, existing consumer trust and payment rails | No brand control, no allocation system, price-driven race to the bottom, counterfeit/grey-market exposure (see [§13](13-risks-mitigations.md)) |
| A new own-web-app entrant (this project) | Direct-to-consumer + wholesale + pre-order, single brand | SG/SEA-first | Deposit-then-balance pre-order pricing at/near MSRP; tiered wholesale for approved B2B accounts | **Native**: deposit/balance, allocation-rule engine, per-customer caps (see [§7](07-preorder-workflow.md)) | Purpose-built pre-order UX no incumbent in the region has; owns the customer relationship and margin (no marketplace commission) | No brand trust yet; no organic supply-chain access without the brick-and-mortar workaround (see [§4](04-supplier-distribution.md)); must build community from zero |

## Market gaps this business can own

1. **A pre-order experience actually designed for TCG drops, in SEA.**
   None of the SG/SEA channels surveyed (Maxsoft is a distributor not a
   storefront; Shopee/Lazada/Carousell are generic marketplaces) offer
   a deposit-now/balance-at-allocation flow with transparent allocation
   rules. This is a real, buildable differentiator and is exactly what
   the `preorders` + `allocation_rules` tables in this repo's schema
   are for (see [§9](09-data-model.md)).

2. **Multi-game assortment with a single checkout and single loyalty
   relationship.** The ICv2 data shows demand is currently spread
   across MTG, Pokémon, and One Piece simultaneously **[S4]** — a
   single-game specialist misses two-thirds of that demand. Maxsoft's
   catalog already covers two of the three without the brick-and-mortar
   gate **[S7]**; MTG is the harder unlock (see [§4](04-supplier-distribution.md)).

3. **Transparent, rule-based allocation instead of "first come, first
   served until we quietly run out."** Distributors themselves reserve
   the contractual right to allocate on short supply **[S3]** — that
   uncertainty gets passed down the chain today with little
   transparency to the end customer. A published, rule-driven
   allocation policy (e.g. "8 units reserved for direct customers,
   capped at 2/customer, remainder FIFO to wholesale" — the exact shape
   already seeded in `supabase/seed.sql`) is a trust-building
   differentiator, not just a technical feature.

4. **Owning the storefront to avoid marketplace fee compression.** At
   10.75% commission + 2.5–3.5% + $0.30 per TCGplayer transaction
   **[S9]**, and Stripe's own-site processing at roughly ~3.4% + S$0.50
   for SG cards (verify current rate — **[S14]**), a low-margin sealed
   product category keeps meaningfully more margin per sale on an
   owned storefront than on a commissioned marketplace. This is the
   core economic argument for the custom web app over a pure
   marketplace-listing strategy (quantified in [§12](12-financial-model.md)).

## Where this business will *not* win on day one

It will not out-content Star City Games/ChannelFireball's 15+ years of
strategy articles and event coverage, and it will not get WPN/FaB
distributor-tier wholesale pricing without a physical location
**[S1] [S2]**. Both are addressed in the phased plan in
[§14](14-final-recommendation.md): win on pre-order UX and multi-game
assortment first; build content and physical presence over time.
