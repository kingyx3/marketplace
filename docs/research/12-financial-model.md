# 12 — Financial model

All figures below are either directly sourced (marked with a citation)
or explicitly labeled as an estimate with a validation step, per the
convention in `sources.md`. Do not treat unlabeled numbers as verified.

## Startup costs (estimate — validate before committing capital)

| Item | Estimate | How to validate |
| --- | --- | --- |
| Initial sealed-product inventory (first pre-order batch) | Variable — sized to pre-order deposits collected plus a small buffer, per the pre-sale-driven model in [§03](03-business-model.md) | Distributor price list / minimum order quantity from actual sourcing route ([§04](04-supplier-distribution.md)) |
| Business registration (Singapore) | Low, hundreds of SGD via ACRA for a private limited company or sole proprietorship | ACRA fee schedule (not independently verified in this pass) |
| Platform/hosting | Near-zero pre-revenue (Vercel + Supabase free tiers) | `docs/cost-controls.md` |
| Payment processing setup | No fixed cost — Stripe is pay-per-transaction | **[S14]** — verify current SG rate |
| Packing materials, initial shipping supplies | Low, hundreds of SGD | Local supplier quotes |
| Marketing (community setup, initial content) | Low if founder-run; scales with paid acquisition later | N/A — no paid-acquisition budget assumed for MVP ([§14](14-final-recommendation.md)) |

## Unit economics on a booster box

Two real data points anchor this, deliberately kept separate because
they measure different things:

- **Retail (shelf) margin, LGS practitioner estimate:** ~15–20% gross
  margin — a $100 box nets roughly $15–20 **[S15]**. This is the
  baseline to assume for ordinary, non-hyped sets sold after release.
- **Pre-sale margin, hyped-set case study:** LotR Collector Booster Box
  — distributor cost ~US$280, pre-sale retail ~US$434.80, a ~55%
  markup captured before shipping **[S4]**. Treat this as an *upside
  case on marquee releases*, not the base case (the source article
  itself frames this level of demand as exceptional, last matched by
  Commander Legends in 2020 **[S4]**).
- **Historical structural anchor (dated, illustrative of shape only):**
  ~2011 data put WPN-Premier direct-from-Wizards cost at ~$66.60/box
  (≈50% off a ~$132.84 MSRP-equivalent) versus ~$74–77/box for
  non-Premier stores buying through distribution **[S5]** — the
  *ratio* (best-tier pricing roughly half of retail; everyone else
  pays a real markup on top) is corroborated structurally by current
  WPN/FaB policy gating **[S1] [S2]**, even though the dollar figures
  are 15 years stale.

**Working assumption for modeling:** budget on **20% gross margin** for
ordinary sealed retail/wholesale turnover, and treat anything above
that on a specific pre-order as genuine upside from hype-driven demand,
not as the number to build a break-even model on.

## Fees to net out of gross margin

| Fee | Rate | Source |
| --- | --- | --- |
| Payment processing (Stripe, SG card) | Commonly cited ~3.4% + S$0.50 domestic | **[S14]** — verify current published rate before modeling |
| TCGplayer marketplace (if used as a secondary channel) | 10.75% commission + 2.5% + $0.30 domestic / 3.5% + $0.30 international transaction fee; +2% PayPal international payout (capped $20) | **[S9]** |
| Shopee/Lazada/Carousell (if listed) | Not independently verified this pass | **[S12] [S13]** — pull live before modeling |
| Singapore GST | 9% (current standard rate at time of writing — verify against IRAS) on domestic standard-rated supplies; 0% on documented exports | **[S8]** |

**Implication:** on a 20% gross-margin box, ~3.4–4% payment-processing
fees alone consume 17–20% of the *margin* (not of revenue) on an
own-site sale — meaningfully worse if the same sale also carries a
double-digit marketplace commission. This is the quantified version of
the "own the storefront" argument in [§02](02-competitive-benchmarking.md)
and [§08](08-technical-implementation.md): margin this thin cannot
comfortably absorb a marketplace commission layered on top of payment
processing.

## Break-even scenarios (framework, not a forecast)

Break-even for a pre-sale-driven launch reduces to a simple identity:

```
deposits collected on a set  ≥  distributor invoice for that set's stock
                              +  payment-processing fees on deposits
                              +  packing/shipping cost per unit × units
                              +  any marketing spend attributed to that launch
```

Because the pre-sale model collects deposits *before* the distributor
invoice is typically due ([§03](03-business-model.md)), a well-run
pre-order round can be cash-flow-neutral or positive before a single
box physically moves — the real financial risk is under-collecting
deposits relative to committed purchase quantity (over-ordering against
demand) or the opposite, being allocation-cut by the distributor after
deposits are already collected (under-supply against promises — see
[§13](13-risks-mitigations.md) for the refund-policy mitigation this
requires). Model each pre-order round independently rather than
assuming a steady-state monthly revenue number until at least 2–3
rounds of real data exist ([§14](14-final-recommendation.md), 30/60/90
plan).
