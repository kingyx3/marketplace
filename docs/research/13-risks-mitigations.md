# 13 — Risks & mitigations

| Risk | Evidence it's real | Mitigation |
| --- | --- | --- |
| **Allocation cuts from upstream distributors** | GTS Distribution's own terms explicitly reserve the right to allocate limited-availability product among customers at any time **[S3]** — this is standard, not exceptional | Never sell pre-orders against unconfirmed supply as if guaranteed; publish the allocation policy up front ([§07](07-preorder-workflow.md)); full deposit refund if a pre-order isn't allocated at all |
| **Price crashes on overprinted/low-demand sets** | 18 of 25 tracked sealed products lost value within about a month in one independently-tracked period; MTG Zendikar Rising sealed product fell 21–23% in a month **[S6]** | Don't hold speculative non-pre-sold inventory on ordinary sets; size purchase quantity to pre-order demand, not to a guess at future appreciation; treat the ~20% gross-margin baseline ([§12](12-financial-model.md)) as the number to survive on, not a hoped-for price run-up |
| **Counterfeit / grey-market product** | Grey-market/parallel-import sourcing carries no distributor recourse and real publisher-relationship risk **[§04]**; consumer marketplaces (Carousell-style) are a known vector for counterfeit sealed product in this category generally | Source through legitimate distributor or LGS-partnership routes ([§04](04-supplier-distribution.md)); publish a sourcing/authenticity statement; keep purchase-order paper trail (`purchase_orders`/`purchase_order_items`) as provenance |
| **Chargebacks / payment fraud** | Not independently sourced this pass, but a structural risk for any pre-paid, non-instantly-delivered goods business | Manual-capture PaymentIntents mean disputed pre-orders can be released without ever capturing funds ([§07](07-preorder-workflow.md)); webhook idempotency prevents double-processing disputes (`docs/security.md`); keep delivery/tracking evidence on every shipment |
| **Currency exposure** | Distributor and publisher pricing is frequently USD-denominated (GTS, WPN terms reviewed in USD **[S3]**) while retail sales in this business are SGD | Price sealed product with a currency buffer against USD/SGD movement between order and distributor invoice payment; the schema already carries a `currency` column on every money table rather than assuming a single currency, precisely for this reason |
| **SG GST registration threshold and mistreatment of exports** | IRAS: domestic online sales are standard-rated; exports can be zero-rated only with correct documentation; overseas-vendor low-value-goods rules add marketplace-specific complexity **[S8]** | Track cumulative taxable turnover against the S$1M mandatory-registration threshold; register voluntarily earlier if B2B customers need GST-registered invoices; keep export documentation disciplined from day one for any cross-border SEA sales |
| **Publisher/organized-play relationship risk** | WPN and FaB retailer policies exist specifically to control supply chains and can revoke status for policy violations (e.g. reselling grey-market stock, violating street-date rules) **[S1] [S2]** | Follow street-date rules exactly (FaB: no delivery before 12:01 AM local release day **[S2]**); don't blend authorized and grey-market stock without disclosure; treat any future WPN/FaB status as an asset worth protecting, not a formality |
| **Working-capital gate from distributor order minimums** | GTS enforces real order minimums via shipping thresholds (US$750–1,600+) and offers no default credit to new accounts **[S3]** | Size the first few pre-order rounds to what deposits can actually fund against these minimums; don't over-commit to a purchase order before deposit collection confirms demand |
| **Concentration risk in a hybrid B2C/B2B model** | Not independently sourced, but structurally implied by [§03](03-business-model.md)'s hybrid-model description | Cap how much of total allocation any single B2B account can absorb via `allocation_rules.max_per_customer`, protecting the B2C community the brand depends on |
| **Building a custom stack instead of a proven hosted platform** | This is a deliberate strategic bet, not a proven-safe default — see the conditional framing in [§08](08-technical-implementation.md) | Keep the MVP scope narrow (docs/build-plan.md); validate the pre-order/allocation differentiation against real customer behavior in the first 1–2 pre-order rounds before investing further in custom features |

## The two risks worth over-indexing on

If forced to prioritize, the two risks most likely to actually sink a
first-year TCG resale business, based on this research: **(1)**
over-ordering speculative (non-pre-sold) inventory on a set that then
crashes in value ([§01](01-market-landscape.md), [§12](12-financial-model.md)),
and **(2)** promising pre-order customers a guaranteed allocation the
business cannot actually deliver once its own distributor allocates it
short ([§04](04-supplier-distribution.md), [§07](07-preorder-workflow.md)).
Both are addressed structurally by the pre-sale-driven model and the
transparent allocation-rules system this repo is built around — but
both require operational discipline (don't over-promise, don't
speculate) that no schema or CI pipeline can enforce on its own.
