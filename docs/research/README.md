# Research: The business of selling sealed TCG booster boxes

A 14-section research report backing the decision to build and launch
a booster-box distribution business — B2C retail, B2B/wholesale, and
pre-orders — for Magic: The Gathering (primary), Pokémon TCG, Yu-Gi-Oh!,
One Piece Card Game, Disney Lorcana, and Flesh and Blood. Region focus
is Singapore and Southeast Asia, benchmarked against the mature US
market (TCGplayer, Star City Games, Card Kingdom, GTS Distribution and
peers).

This report is the business case behind the technical scaffold in the
rest of this repository (Next.js + Supabase + Stripe — see
[`../architecture.md`](../architecture.md)); sections 6–9 are written
to match the schema and workflows actually implemented.

## How to read this

Start with the [executive summary](00-executive-summary.md) and the
[final recommendation](14-final-recommendation.md) — together they're
the ~10-minute version. Then go section by section, or jump straight to
whichever decision you're making right now.

**Read [`sources.md`](sources.md) before quoting a number from this
report elsewhere.** Some figures are verified against primary sources
with direct quotes; others are industry-consensus estimates flagged as
such, with the step needed to confirm them.

## Sections

| # | File | Covers |
| --- | --- | --- |
| — | [00-executive-summary.md](00-executive-summary.md) | Cross-cutting summary |
| 1 | [01-market-landscape.md](01-market-landscape.md) | Competitor deep-dives: TCGplayer, Star City Games, Card Kingdom, ChannelFireball, and the SEA/Shopee-Carousell layer |
| 2 | [02-competitive-benchmarking.md](02-competitive-benchmarking.md) | Comparison table + market gaps this business can own |
| 3 | [03-business-model.md](03-business-model.md) | B2C / B2B / hybrid / pre-sale / subscription / community models — margins, inventory risk, cash flow |
| 4 | [04-supplier-distribution.md](04-supplier-distribution.md) | Official distributor routes, WPN/publisher gating, grey-market risk |
| 5 | [05-customer-segmentation.md](05-customer-segmentation.md) | Players, collectors, investors, resellers, LGS buyers |
| 6 | [06-website-experience.md](06-website-experience.md) | The web-app feature set this niche actually needs |
| 7 | [07-preorder-workflow.md](07-preorder-workflow.md) | Deposit/balance design, allocation, refunds, communication |
| 8 | [08-technical-implementation.md](08-technical-implementation.md) | Hosted platforms vs. custom build; why Next.js + Supabase + Stripe |
| 9 | [09-data-model.md](09-data-model.md) | Schema narrative (mirrors `supabase/migrations/`) |
| 10 | [10-operations.md](10-operations.md) | Receiving, storage, packing, shipping, returns |
| 11 | [11-go-to-market.md](11-go-to-market.md) | Launch strategy, community, content, channel mix |
| 12 | [12-financial-model.md](12-financial-model.md) | Startup costs, unit economics, fees, break-even |
| 13 | [13-risks-mitigations.md](13-risks-mitigations.md) | Allocation cuts, price crashes, fraud, currency, GST |
| 14 | [14-final-recommendation.md](14-final-recommendation.md) | Verdict, niche, stack, MVP, 30/60/90-day plan, KPIs, mistakes |
| — | [sources.md](sources.md) | Full citation list and verification notes |

## The one fact that shapes everything else

Every official supply route checked for this report — Wizards Play
Network for Magic **[S1]**, Legend Story Studios' Flesh and Blood
Retailer Supply Policy **[S2]**, and GTS Distribution's wholesale
account terms **[S3]** — gates wholesale/distributor access behind
owning a **brick-and-mortar retail location**, not just having a
business registration and a website. A web-app-only business cannot,
on day one, become an *authorized distributor account* for MTG or FaB
sealed product. This single constraint drives the sourcing strategy in
[§4](04-supplier-distribution.md) and the final recommendation in
[§14](14-final-recommendation.md): partner with or become an LGS, or
source through a regional distributor whose product lines don't carry
that gate (e.g. Pokémon/One Piece/Bandai lines through a Singapore
distributor like Maxsoft **[S7]**), rather than assume direct WPN-tier
pricing is available from a pure e-commerce operation.
