# 14 — Final recommendation

## Verdict

**Proceed, but sequence around the brick-and-mortar gate rather than
against it.** The business case is real: sealed TCG demand is
currently strong across multiple games simultaneously **[S4]**, the
pre-sale model offers genuinely superior margin and cash-flow
characteristics versus passive retail ([§03](03-business-model.md)),
and no incumbent SEA channel reviewed offers a purpose-built pre-order/
allocation experience ([§02](02-competitive-benchmarking.md)). The one
hard constraint — official MTG and FaB distributor/wholesale access
requires a brick-and-mortar location **[S1] [S2]** — is real and
non-negotiable, but it's a sequencing problem, not a business-model
killer: it changes *which games launch first* and *how MTG/FaB supply
gets solved*, not whether the business should exist.

## The niche to own

**The pre-order and allocation experience for multi-game sealed
product in Singapore/SEA** — not the broadest catalog, not the lowest
price, not competing with Star City Games/ChannelFireball on content.
Concretely: transparent, published allocation rules; deposit-then-
balance checkout that matches how the actual supply chain works instead
of pretending certainty it doesn't have; and reliable communication
during the allocation window, which is where every channel reviewed
in this report is currently weakest.

## Stack

Next.js 15 + Supabase (Postgres/RLS/Auth) + Stripe (manual-capture
PaymentIntents), deployed to Vercel via GitHub Actions with a minimal,
documented set of GitHub Environment secrets — already built in this
repository. Full rationale and alternatives considered:
`docs/architecture.md` and [§08](08-technical-implementation.md).

## MVP scope

Sell **one pre-order round on one well-chosen Pokémon/One Piece-line
set** (sourced via a route like Maxsoft with no brick-and-mortar gate
**[S7]**) end-to-end through the deposit → allocation-result → balance
→ ship flow. Explicitly **not** in the MVP: MTG/FaB inventory (blocked
on the physical-location question), B2B accounts (until the direct
model is proven), subscription/box-break content, and a multi-currency
storefront. This matches `docs/build-plan.md`'s Phase 1/Phase 2 split
exactly — commerce fundamentals first, pre-order differentiation
second, B2B third.

## 30/60/90-day plan

**Days 1–30:**
- Confirm the sourcing route (contact Maxsoft or equivalent regional
  distributor directly to get actual account terms — this report
  found their catalog but could not verify a self-serve wholesale
  application **[S7]**).
- Wire the auth, cart/checkout, and Stripe manual-capture flow onto the
  existing schema (`docs/build-plan.md` Phase 1).
- Stand up Discord/Telegram community presence and publish the
  allocation policy publicly, before the first pre-order opens.
- Register the business (ACRA) and confirm GST registration is *not*
  yet required at expected first-year volume **[S8]**.

**Days 31–60:**
- Run the first pre-order round on one set. Execute the full
  notification cadence ([§07](07-preorder-workflow.md)) without
  skipping the allocation-result message — this is the single most
  trust-building step in the whole flow.
- Publish an allocation post-mortem regardless of outcome (full
  allocation or a cut) — this is content *and* trust-building at the
  same time ([§11](11-go-to-market.md)).
- Begin exploratory conversations with 2–3 LGS operators about either
  a fulfillment partnership (to unlock MTG/FaB supply — [§04](04-supplier-distribution.md))
  or simply as future B2B accounts.

**Days 61–90:**
- Run a second pre-order round, ideally on a different game in the
  assortment, to validate the multi-game thesis (not just a one-set
  fluke).
- If the LGS conversations produced a viable partnership, begin
  sourcing MTG/FaB product through it.
- Decide, based on real deposit-collection data from two rounds,
  whether to open the B2B application flow (Phase 3,
  `docs/build-plan.md`).

## KPIs / metrics to track from day one

- **Pre-order deposit-to-allocation-fulfilled rate** (did the business
  actually deliver what it took deposits for?) — the single most
  important trust metric.
- **Gross margin per pre-order round**, benchmarked against the ~20%
  baseline / hyped-set upside framework in [§12](12-financial-model.md).
- **Time from allocation confirmation to customer notification** — the
  research identifies silence during this window as the incumbent
  weak point to beat.
- **Refund rate and reason** (allocation-not-fulfilled vs. customer
  cancellation vs. damage) — a rising allocation-not-fulfilled rate is
  an early warning that purchase commitments are outrunning actual
  supply.
- **Repeat pre-order rate** — the real signal that the allocation-
  transparency differentiation is working, versus one-off novelty.

## Common first-year mistakes to avoid

1. **Treating a pre-order as a guarantee before supply is confirmed.**
   The distributor layer itself doesn't guarantee quantity **[S3]** —
   neither should this business, without the refund safety net in
   [§07](07-preorder-workflow.md).
2. **Speculating on non-pre-sold inventory because a set "feels hot."**
   The data shows real, fast depreciation is common, not rare
   **[S6]** — size purchases to actual pre-order demand.
3. **Assuming grey-market sourcing is a harmless shortcut.** It risks
   both counterfeit exposure and the organized-play relationship this
   business will eventually want ([§04](04-supplier-distribution.md),
   [§13](13-risks-mitigations.md)).
4. **Going silent during the allocation window.** This is the specific,
   named failure mode the entire differentiation strategy exists to
   fix — repeating it defeats the point of building custom software
   for it.
5. **Chasing MTG/FaB supply before the brick-and-mortar question is
   resolved.** Launch on the games where legitimate wholesale access
   doesn't require it, and treat MTG/FaB as a phase-2 unlock via
   partnership, not a phase-1 blocker.
6. **Over-investing in the custom platform before validating the
   differentiation with real customers.** Keep the MVP narrow
   (`docs/build-plan.md`); the pre-order/allocation thesis is
   well-supported by this research but still deserves real-world
   validation in the first two rounds before further build-out.
