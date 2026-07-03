# Sources

Citation markers `[S#]` used throughout `docs/research/` resolve here.
Sources are split into two tiers based on how they were obtained during
this research pass:

- **Verified** — content was fetched and specific claims were extracted
  with direct quotes, then passed through independent adversarial
  review (2-of-3 vote to kill a claim). Of 53 verification votes cast
  across all extracted claims, only 2 refuted a single claim (S7's
  claim about a dedicated B2B onboarding flow — see the note on S7
  below); everything else survived unchallenged.
- **Pointer** — the URL was surfaced by search as directly relevant and
  is cited as the correct place to get current, authoritative numbers,
  but this pass could not extract verified quotes from it (fetch
  blocked, or the page is a live pricing/fee schedule that changes
  often and should be checked at time of use rather than trusted from
  a point-in-time report). Treat these as "go here to confirm," not as
  already-confirmed facts.

## Verified

| # | Source | What it's cited for |
| --- | --- | --- |
| S1 | Wizards Play Network — [What is required to join the WPN](https://askwpn-na.wizards.com/hc/en-us/articles/13384467692435-What-is-required-to-join-the-WPN) | WPN eligibility requires a brick-and-mortar store; application documentation; video walkthrough; 1–3 business day processing |
| S2 | Legend Story Studios — [Flesh and Blood Retailer Supply Policy](https://fabtcg.com/resources/retailer-supply-policy/) | FaB distributor eligibility (brick-and-mortar Retailer Types); online-only sellers restricted to singles, not sealed; marketplace listing rules; street-date release rules |
| S3 | GTS Distribution — [Open a GTS Business Account](https://www.gtsdistribution.com/info/open-a-gts-business-account.asp) | Two-stage wholesale onboarding (pre-screening + application with resale certs); shipping-threshold order minimums; allocation rights; credit terms; 3–5 business day processing |
| S4 | ICv2 — [MTG LotR Collector Booster Boxes Boffo Preorder (Apr 2023)](https://icv2.com/articles/news/view/53855/magic-the-gathering-lotr-collector-booster-boxes-boffo-preorder-early-signs-tcg-category-growth-2023) | LotR Collector Booster wholesale (~US$280) vs. pre-sale (~US$434.80) pricing; preorder demand ranking on TCGplayer's Top 25; category-wide 2023 growth signal across MTG/Pokémon/One Piece |
| S5 | MTGSalvation forum — [How much do retailers pay for booster boxes?](https://www.mtgsalvation.com/forums/magic-fundamentals/magic-general/314927-how-much-do-retailers-pay-for-booster-boxes) | Historical (~2011) WPN Premier vs. non-Premier wholesale pricing anchor. **Dated** — figures are ~15 years old and illustrative of *structure* (tiered discount, distributor markup), not current pricing. Fetch returned HTTP 403; quotes recovered via search-engine snippets attributed to this exact URL. |
| S6 | ICv2 — [TCG Market Analysis: TCGplayer's Top 25 Sealed Product Prices (Oct 2020 data)](https://icv2.com/articles/news/view/46924/tcg-market-analysis-taking-closer-look-tcgplayers-top-25-sealed-product-prices) | Post-release sealed-price depreciation (18 of 25 tracked products lost value in a month); MTG Zendikar Rising price crash (−21%/−23%); Pokémon XY Evolutions chase-card spike (+165%) |
| S7 | Maxsoft Pte Ltd — [Trading Card Games (Singapore)](https://www.maxsoftonline.com/trading-card-games) | Singapore/SEA distributor for Pokémon TCG, One Piece Card Game, Digimon, Union Arena, Dragon Ball Super Fusion World (Bandai/TPCi side only — **not** MTG, Yu-Gi-Oh!, Lorcana, or FaB). Also Nintendo's official SEA distributor. **Caveat:** an adversarial verify pass (2 of 3 votes) refuted the stronger claim that the site's `/purchase-trading-card` page is a *dedicated wholesale/B2B application flow* — the page title alone doesn't establish that; it may simply be a consumer "where to buy" locator. Treat "Maxsoft carries these TCG lines" as confirmed; treat "Maxsoft has a self-serve B2B onboarding page" as unconfirmed — contact Maxsoft directly to ask. |
| S8 | IRAS — [GST: e-Commerce](https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/specific-business-sectors/e-commerce) | Domestic online sales standard-rated for GST; exports zero-rated with documentation; e-commerce taxed the same as offline; low-value goods (≤S$400) overseas vendor registration regime; S$100,000 / S$1M registration thresholds |
| S9 | TCGplayer — [TCGplayer Fees](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees) | 10.75% marketplace commission; 2.5% + $0.30 domestic transaction fee (3.5% + $0.30 international); 2% PayPal international payout fee (capped $20); recent fee-structure changes (Direct orders drop the flat fee) |

## Pointers (verify directly before relying on the figure)

| # | Source | Why it matters |
| --- | --- | --- |
| S10 | [WPN — Find Distributors](https://wpn.wizards.com/en/resources/distributors) | Official current list of WOTC-authorized MTG distributors by region — the actual account-opening step for MTG supply once a brick-and-mortar location exists |
| S11 | [One Piece Card Game — For Store](https://en.onepiece-cardgame.com/forstore/) | Bandai's own retailer/store page for One Piece Card Game account setup |
| S12 | [Shopee Singapore — Seller Fees](https://seller.shopee.sg/edu/article/13107/seller-fees) | Current Shopee SG commission/payment/transaction fee schedule |
| S13 | [Carousell — Singapore seller fees](https://support.carousell.com/hc/en-us/articles/16779613754009--Singapore-What-are-the-fees-charged-to-sellers) | Current Carousell SG fee schedule |
| S14 | [Stripe — Singapore pricing](https://stripe.com/en-sg/pricing) | Current Stripe SG card-processing rate (used in this report as the commonly-cited ~3.4% + S$0.50 domestic-card estimate; confirm the live number before modeling) |
| S15 | [Keystone Games — Understanding Card Trade-In Values](https://www.keystonegames.net/blogs/keystone-games-community-news-1/the-two-sides-of-the-counter-understanding-card-trade-in-values) | Practitioner (LGS owner) claim that sealed product nets ~15–20% gross margin vs. 45%+ on singles — an insider data point on why pure sealed-box retail is a thin-margin, volume/traffic business for brick-and-mortar stores |
| S16 | [Thornberry Media — So You Want to Open a TCG Store](https://www.thornberrymedia.com/post/so-you-want-to-open-a-tcg-store-the-real-challenges-nobody-talks-about) | Practitioner risk narrative on first-year TCG retail mistakes |

## How industry-consensus estimates are flagged in this report

Where a number is not independently verified against a primary source
(e.g., typical B2B discount percentages between named tiers, Shopee/
Lazada commission rates at the time you read this, courier rates for
SEA shipping of sealed boxes), the relevant section states the figure
as an **estimate** and names the concrete step to validate it (request
a distributor price list, open a WPN application, pull the live fee
page). This mirrors how the scaffold's own `docs/environments.md`
treats unconfirmed operational details — documented as TODO, not
asserted as fact.
