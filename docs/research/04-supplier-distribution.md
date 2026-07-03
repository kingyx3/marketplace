# 04 — Supplier & distribution routes

## The gate: official wholesale access requires brick-and-mortar

This is the load-bearing finding of the whole report. Three independent
official sources, for three different games, all say the same thing:

- **Magic: The Gathering (WPN).** "In order to join the WPN you must
  own a brick-and-mortar retail location with a strong focus on hobby
  gaming and must carry Wizards of the Coast products." A qualifying
  store is defined as "a public brick-and-mortar retail location that
  purchases product from a distributor or directly from Wizards of the
  Coast, and offers current Wizards product on-site for sale to
  customers" **[S1]**. Applications require formal business
  documentation (business license, tax ID, articles of
  incorporation/organization, an executed lease, or equivalent) *and* a
  video walkthrough of the physical premises — Wizards verifies the
  location exists **[S1]**. Once complete, applications process in
  1–3 business days **[S1]** — the bottleneck is having a qualifying
  location, not the paperwork itself.

- **Flesh and Blood (Legend Story Studios' Retailer Supply Policy).**
  To be eligible for distributor supply, a retailer must meet a defined
  "Retailer Type," the primary one being "a bonafide bricks and mortar
  gaming store with table space available for customers to play games
  offered for sale by the retailer" **[S2]**. The policy gets
  specific and checkable: table space for at least 4 players, open to
  the public for unarranged browsing, at least 15 trading hours/week,
  posted exterior signage, and commercial premises authorized for
  retail **[S2]**. Critically: **"Flesh and Blood Sealed Product may
  only be sold online by Bricks and Mortar Gaming Stores. However,
  Bricks and Mortar Gaming Stores and Single Card Websites may sell
  Single Cards online"** **[S2]** — meaning a pure web-app business
  cannot legitimately retail FaB *booster boxes* online at all, gated
  or not, without qualifying as a brick-and-mortar store first. FaB
  also enforces a hard street-date rule: no releasing or delivering new
  product (including online pre-orders and box breaks) before 12:01 AM
  local time on the official release day **[S2]** — directly relevant
  to pre-order fulfillment design (see [§7](07-preorder-workflow.md)).

- **Distributor-level wholesale (GTS Distribution, representative of
  the category norm).** Opening an account is a two-stage gate: a
  pre-screening survey for eligibility, then a signed application with
  current resale certificates and sales-tax documents; GTS reserves
  sole discretion to accept or reject, taking 3–5 business days, and a
  rejected applicant "may be referred to a retail store within your
  local area" — i.e., the screening structurally favors established
  brick-and-mortar retailers over new online-only resellers **[S3]**.
  New accounts get no default credit terms (credit-card-only until
  pre-approved; 18% p.a. on balances more than 21 days past due)
  **[S3]**, and real order minimums are enforced via shipping
  thresholds — free shipping starts at US$750 for one warehouse,
  scaling to US$1,600 for three warehouses at US$200 minimums each
  **[S3]**. GTS also contractually reserves the right to allocate
  limited-availability product among customers at any time **[S3]** —
  allocation risk is a standard term, not an occasional exception.

## What this means practically

A pure web-app booster-box business **cannot**, at launch, become an
authorized MTG or FaB distributor account. The two realistic paths:

1. **Partner with (or become) an LGS.** Either strike a supply/fulfillment
   partnership with an existing brick-and-mortar store that already
   holds WPN/FaB status, or plan a minimal physical presence (a small
   unit, shared space, or even a booth that satisfies FaB's checkable
   minimums **[S2]**) once volume justifies the cost. This is the only
   route to genuine MTG/FaB distributor pricing.
2. **Source games without that gate through a regional distributor.**
   For Singapore/SEA, Maxsoft Pte Ltd carries Pokémon TCG, One Piece
   Card Game, Digimon, Union Arena, and Dragon Ball Super Fusion World
   with no brick-and-mortar requirement found in its public materials
   **[S7]** — validate the actual account-opening process by contacting
   Maxsoft directly, since this pass could not independently confirm a
   self-serve wholesale application flow (see the caveat on S7 in
   `sources.md`).

For Yu-Gi-Oh! (Konami) and Disney Lorcana (Ravensburger), this research
pass did not fetch and verify each publisher's own retailer-supply
policy; treat them as **likely similar to WPN/FaB** (organized-play-
network-gated) until confirmed, and validate directly against each
publisher's retailer program page before assuming otherwise.

## Grey-market / parallel imports

Sourcing sealed product through non-authorized channels (bulk-buying
from overseas marketplaces, parallel-importing MSRP-priced boxes from a
region with weaker currency, or buying from other retailers' overstock)
is common in practice and carries real risk:

- **No recourse on damaged/defective product** — an authorized
  distributor relationship typically includes replacement/return terms
  that a grey-market purchase does not.
- **Publisher/organized-play consequences.** WPN and FaB policies exist
  specifically to control retailer supply chains; a store discovered
  reselling grey-market stock while holding WPN/FaB status risks
  losing that status.
- **Counterfeit exposure.** Grey-market and marketplace-sourced sealed
  product (especially via consumer marketplaces like Carousell) carries
  materially higher counterfeit risk than distributor-sourced product —
  see [§13](13-risks-mitigations.md) for mitigations (tamper-evident
  packaging checks, sourcing documentation, customer-facing
  authenticity commitments).
- **GST/import documentation risk.** Parallel-imported goods still need
  correct import declarations and GST treatment in Singapore
  regardless of the sourcing channel **[S8]** — informal sourcing
  doesn't exempt the business from compliance.

**Recommendation:** use grey-market/parallel-import sourcing only as a
deliberate, disclosed, short-term bridge (if at all) while pursuing
proper distributor or LGS-partnership access — never as the standing
supply strategy for a business that wants to build long-term trust and
brand.
