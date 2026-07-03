# 08 — Technical implementation: platform vs. custom

## The options

| Approach | Examples | Pros | Cons for this business specifically |
| --- | --- | --- | --- |
| Marketplace-only | TCGplayer, Amazon, Shopee/Lazada/Carousell listings | Zero build cost, instant reach, buyer trust already exists | No control over pre-order/deposit UX (the core differentiator — [§02](02-competitive-benchmarking.md)); 10.75%+2.5–3.5%+$0.30-scale commissions compress an already-thin margin **[S9]**; no allocation-rule capability |
| Hosted platform (Shopify/WooCommerce/BigCommerce) + apps | Shopify + a deposit/partial-payment app, wholesale app | Fast to launch, PCI/payments handled, huge plugin ecosystem | Deposit-then-balance and allocation-by-rule are not native — bolted on via third-party apps with their own fees and UX compromises; wholesale tiering often needs a second paid app; the *data model* (allocation rules, B2B tiers, oversell guard) has to be forced into a platform not designed for it |
| Custom build | This repo: Next.js + Supabase + Stripe | Full control of the pre-order/allocation UX that is the actual market gap; own the data model exactly; no per-app subscription fees; scales down to near-zero cost pre-revenue | Higher upfront build effort; team owns more of the operational surface (deploys, migrations, security) than a hosted platform would |

## Why custom, for this specific business

The research is consistent on one point: **the differentiator this
business can own is the pre-order/allocation experience**
([§02](02-competitive-benchmarking.md)), and that experience is exactly
the part hosted platforms model worst. A deposit captured now and a
balance captured later, tied to a rule-based allocation engine that
respects channel reserves and per-customer caps, is a custom checkout
state machine — Shopify's native checkout doesn't have "capture balance
later" as a first-class concept, and third-party deposit apps
generally implement it as two separate orders stitched together after
the fact, which is exactly the kind of fragile workaround this repo's
`preorders` table (with its own `deposit_cents`/`balance_cents` and a
single `order_id` link on conversion) avoids by design.

For a business whose core product margin is already thin
(~15–20% at retail — **[S15]**), avoiding stacked SaaS/app subscription
fees (platform fee + deposit-app fee + wholesale-app fee) on top of
payment processing matters more than it would for a higher-margin
category.

## Why this stack specifically (Next.js + Supabase + Stripe)

- **Supabase (Postgres)** gives a real relational database with
  row-level security, not a document store or a platform's proprietary
  schema — necessary for the referential integrity this data model
  needs (oversell guard as a database CHECK constraint, audit triggers,
  generated columns) — see [§09](09-data-model.md).
- **Stripe** supports manual-capture PaymentIntents natively, which is
  the exact primitive the deposit/balance design needs, plus mature
  webhook infrastructure for reliable state updates.
- **Next.js on Vercel** gives server-rendered catalog pages (fast,
  SEO-friendly for organic discovery — relevant to the content/SEO
  angle in [§11](11-go-to-market.md)) with scale-to-zero hosting cost,
  which matters pre-revenue.
- Full rationale, alternatives considered (GCP+Terraform, Cloudflare),
  and cost comparison: `docs/architecture.md`.

## When a hosted platform would have been the right call instead

If the business's differentiation were assortment/price (compete on
having the most SKUs at the lowest price) rather than pre-order
experience, a hosted platform would very plausibly be the faster,
cheaper path to revenue, and this report would recommend it. The
custom-build recommendation is conditional on the pre-order/allocation
gap actually being real and actually mattering to the target segments
— which [§01](01-market-landscape.md)–[§05](05-customer-segmentation.md)
argue it is, but this is a judgment call worth re-testing against real
customer feedback early (see the MVP scope in [§14](14-final-recommendation.md)).
