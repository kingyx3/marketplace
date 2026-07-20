# Administrative control centres

The protected `/control` console is organized by ownership domain. Each task has one canonical control centre, one read permission, and distinct action permissions. Pages, Server Actions, and administrative APIs authorize the specific action; navigation only exposes domains covered by the administrator's active grant.

## Domain map

| Domain     | Canonical route       | Owns                                                                      | Does not own                             |
| ---------- | --------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Catalog    | `/control/catalog`    | Product identity, taxonomy, media, physical SKU attributes                | Price, stock, availability, publication  |
| Pricing    | `/control/pricing`    | Versioned base/compare-at prices and promotions                           | Product identity, inventory, publication |
| Storefront | `/control/storefront` | Listing content, availability, selling windows, release date, publication | Physical SKU or price                    |
| Supply     | `/control/supply`     | Suppliers, purchase orders, on-hand/incoming/safety stock                 | Customer orders or fulfilment            |
| Orders     | `/control/orders`     | Normal orders, preorders, order lifecycle, allocation                     | Payment reconciliation or shipping       |
| Fulfilment | `/control/fulfilment` | Packing, shipment arrangement, tracking, delivery exceptions              | Payment decisions                        |
| Customers  | `/control/customers`  | Customer context, account lifecycle, communications                       | Order financial state                    |
| Finance    | `/control/finance`    | Payment exceptions, reconciliation, refunds                               | Order fulfilment                         |
| Governance | `/control/governance` | Administrator access and audit evidence                                   | Commerce mutations                       |

Do not add a second mutation surface for a resource in another domain. Cross-domain pages may link to the owning control centre and show read-only readiness state.

## Access provisioning

- `ADMIN_EMAIL_ALLOWLIST` is authoritative for protected environment owners.
- Owners provision delegated administrators at `/control/governance/administrators/new`.
- A role (`viewer`, `support`, `catalog`, `operations`, `admin`, or `owner`) is a starting template, not the authorization decision.
- The owner then selects whole domains or individual action checkboxes. Selecting write coverage retains the domain's read permission.
- Explicit rows in `admin_access_grant_permissions` are the effective database-managed coverage. Existing grants are backfilled from their former role.
- Only an owner may grant `governance.manage`, create another owner, demote an owner, or revoke owner coverage.
- Environment owners cannot be revoked in the UI, and the final active owner cannot remove themself.
- First sign-in with the exact normalized email binds the grant to the Supabase Auth identity and synchronizes `staff_users`.

Sensitive permissions are intentionally separate: `pricing.approve`, `storefront.publish`, `inventory.adjust`, `purchase_orders.manage`, `preorders.allocate`, `customers.manage`, `payments.reconcile`, `refunds.manage`, and `governance.manage`.

## Product-to-listing flow

1. **Product** — Create the draft at `/control/catalog/products/new`; set identity, category, release, type, language, description, and media.
2. **Physical SKU** — Add the SKU code, barcode, box/pack configuration, weight, and active state on `/control/catalog/products/[productId]`.
3. **Pricing** — Set a versioned base and optional compare-at price at `/control/pricing`. Catalog SKU saves never write money.
4. **Supply** — Record stock, incoming quantity, safety stock, supplier, or purchase order at `/control/supply`.
5. **Availability and listing** — Set `available_now`, `preorder`, `coming_soon`, or `unavailable`, plus optional order windows, release date, merchandising, and customer limits at `/control/storefront/listings/[productId]`.
6. **Readiness review** — Review product, SKU, current price, supply, availability, and storefront content from the guided product workflow.
7. **Publish** — An administrator with `storefront.publish` makes the final customer-facing decision.

Publication is rejected unless the product is active, an active physical SKU and current price exist, and availability is not `unavailable`. `available_now` also requires inventory above safety stock. New products and listings default to unpublished.

## Pricing and promotions

- `sku_prices` is the versioned pricing source. `booster_box_skus.price_cents`, `msrp_cents`, and `currency` are compatibility caches maintained by a database trigger for existing checkout reads.
- Saving a new current price closes the previous open price and writes an audit record.
- Promotion drafts require `pricing.manage`; activating a promotion additionally requires `pricing.approve`.
- Verify the effective price and eligible promotion in the public product and checkout flows after a change.

## Supply and preorder allocation

- Inventory adjustments require a reason code and optional reviewer note at `/control/supply`.
- Purchase-order intake records the order and incoming inventory transactionally.
- Suppliers with open purchase orders cannot be archived.
- Preorder allocation is reviewed at `/control/orders/allocations` and requires both `preorders.allocate` and `refunds.manage` because partial allocation can create Stripe refunds.
- Allocation remains FIFO, fingerprints the reviewed queue, rejects stale confirmations, and is idempotent for refunds.

## Orders, finance, and fulfilment

- `/control/orders` is the commercial order context and non-financial lifecycle workspace.
- `/control/finance` owns provider exceptions and manual reconciliation. Reconciliation requires provider, payment reference, amount, currency, reason, and actor.
- `/control/fulfilment` owns packing and shipment mutations for fully captured orders.
- A single order action maps to exactly one owning permission: `orders.manage`, `fulfilment.manage`, or `payments.reconcile`.

## Customers and communications

- `customers.view` can search and inspect retained lifecycle context.
- `customers.manage` is required to disable or restore access.
- `communications.manage` is required for operational and restock notifications.
- Deleted customer rows remain retained for audit; a row without a linked Auth identity cannot be restored through the console.

## Audit and operational safety

- Review administrative evidence at `/control/governance/audit` with `audit.view`.
- Core table triggers preserve before/after row images; explicit control actions include the actor and business action.
- Never copy secrets, tokens, payment credentials, or unnecessary personal data into operational notes.
- Correct applied schema mistakes with a new forward migration.
- Stripe-confirmed state and verified webhooks remain authoritative for payment transitions; browser-provided state never marks an order paid.
