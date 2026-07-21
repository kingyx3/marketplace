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

## List-first interaction model

Every control centre opens on its record list, queue, or dashboard. Administrators should retain the surrounding list context while working:

- Use a **Create …** action on the owning list to open a creation form in a route-addressable modal.
- Make the complete record card or row the edit/view target. Clicking it opens that record in the same modal layer.
- Do not place create, edit, lifecycle, reconciliation, inventory, allocation, or fulfilment mutation forms directly in list pages. Search and filter forms are the only forms that belong on an index.
- Close with the modal button, `Escape`, the backdrop, or browser back to restore the unchanged list and filters. The record's **Back to …** action returns to the canonical unfiltered list and also supports direct-route fallbacks.
- Canonical detail routes remain refreshable and bookmarkable; client-side navigation from a control list is intercepted into the modal layer.
- Read-only administrators use the same record modal without mutation controls. Permissions continue to be checked by the record page and again by every Server Action or RPC.

This model applies to products, categories, sets, SKU prices, promotions, listings, storefront configurations, inventory, suppliers, purchase orders, orders, preorders, allocation queues, deliveries, customers, payment exceptions, reconciliation, and administrator grants. Audit evidence remains a read-only table because it has no create or edit workflow.

## Form, modal, and confirmation contract

All standard control mutations use the shared action-form layer. Product intake, product-detail save, and direct-to-storage image upload keep their specialized state machines but participate in the same dirty-form contract.

- A submit validates native constraints and cross-field relationships, focuses the first invalid control, announces a global summary, and applies field-level red error treatment. Server validation remains authoritative.
- While a request is in flight, the form exposes `aria-busy`, its submit control is disabled, and its label describes the operation. Repeated submits are ignored.
- A failed request leaves the modal and every entered value in place. Safe actionable errors are announced; unexpected server errors use generic retry guidance rather than exposing database or provider details.
- Success clears the dirty marker, refreshes server-rendered data, announces completion when the form remains open, and returns to the canonical list when the workflow is complete. Product creation continues to product/SKU readiness because it is a multi-domain flow.
- Closing a dirty modal by Close, backdrop, `Escape`, or browser back opens the same accessible discard dialog. Focus is trapped inside both modal layers and restored to the launching control on close. Page unload also receives the browser's unsaved-change safeguard.
- Lifecycle and customer-facing state changes use an explicit confirmation. High-risk actions—customer disable, order cancellation, manual reconciliation, and preorder allocation/refunds—also require typed confirmation.
- Search and filter forms are read-only navigation controls and intentionally do not use mutation confirmations or dirty-state tracking.
- The console exposes archive/restore and audited customer disable/restore instead of hard-delete controls. Permanent record deletion is intentionally unavailable from administrator workflows.

## Reviewed workflow inventory

The following inventory is the required regression scope for changes to `/control`:

| Domain     | Workflows reviewed                                                                                                                                                       | Consequential safeguards and failure behavior                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog    | Product intake and hierarchy creation; product identity/media update; SKU create/update; product/SKU archive and restore; category and set create/update/archive/restore | Generated identifier collisions remain on the active form; product/SKU/category/set lifecycle changes are confirmed; active relationships and UUID/value constraints are rechecked server-side |
| Pricing    | SKU price version creation; promotion create/update; promotion activate/deactivate                                                                                       | New prices and promotion activation are confirmed; compare-at price and promotion windows are validated on client and server; pricing approval remains distinct from editing                   |
| Storefront | Listing content, limits, availability mode/windows, configuration JSON, publish/unpublish                                                                                | JSON, tags, and date relationships receive field errors; customer-facing configuration and publication are confirmed; publish readiness is transactionally rechecked                           |
| Supply     | Inventory adjustment; supplier create/update/archive/restore; purchase-order intake                                                                                      | Stock adjustments and supplier commitments are confirmed and audited; open dependants prevent archive; failed submissions preserve counts, costs, and notes                                    |
| Orders     | Normal order review, unpaid cancellation, payment-exception flagging; preorder review; allocation preview/finalization                                                   | Cancellation requires `CANCEL`; allocation requires the reviewed fingerprint, refund permission, checkbox, and typed `ALLOCATE`; stale previews and provider failures remain reviewable        |
| Fulfilment | Mark packing; arrange/update carrier and recipient address; update shipment status                                                                                       | Every customer-visible transition is confirmed; paid-state and status transitions are rechecked server-side; address and carrier values remain on failure                                      |
| Customers  | Search/view retained records; disable/restore account                                                                                                                    | Disable requires `DISABLE`; self-disable, active staff, missing linked identity, and rollback paths fail safely; auth/customer changes and restoration are audited                             |
| Finance    | Exception review; manual Stripe reconciliation                                                                                                                           | Reconciliation requires `RECONCILE`, a provider reference, amount, currency, and reason; permission and order/payment consistency are checked before mutation                                  |
| Governance | Administrator create/update/activate/revoke coverage; audit search/view                                                                                                  | Owner provisioning receives an elevated confirmation; accepted email identity and owner-only coverage are enforced in parser, action, and database; audit is read-only                         |

Each record-list route includes permission-aware empty and read-only states. All detail and creation routes remain addressable both directly and through the intercepted modal routes under `control/@modal`.

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

## Value and consistency contracts

- Treat browser constraints as operator guidance only. Every control mutation parses and normalizes its `FormData` again in the Server Action before a service-role call.
- Record identifiers must be UUIDs; money uses integer minor units and an uppercase three-letter currency code; calendar dates use `YYYY-MM-DD`. Datetime-local values entered in the control console are interpreted in Singapore time and stored as UTC instants.
- Names, codes, notes, URLs, JSON configuration, tags, contact details, and fulfilment addresses have explicit size and shape limits. Optional physical SKU measurements must be positive when present, and compare-at prices must be greater than the selling price.
- Database constraints repeat durable shape rules and protect new or updated rows even when data arrives outside the control UI. Relationship constraints ensure a product's selected set belongs to its selected category.
- Supply RPCs verify active referenced records and the exact action permission. Purchase-order totals must fit the database integer range, and inventory cannot be reduced below already allocated stock.
- A delegated access grant is atomically bound to its first authenticated Supabase user. After acceptance, authorization uses that bound Auth identity, the invitation email is immutable, and owner-only permissions are enforced in both the form parser and database function.
- Length and shape checks added over legacy tables are introduced `NOT VALID`: they protect future writes immediately without rewriting historical rows. Clean up legacy violations before validating those constraints in a later forward migration.

## Product-to-listing flow

1. **Product** — Select **Create product** from `/control/catalog`; the modal sets identity, category, release, type, language, description, and media.
2. **Physical SKU** — Select the product record from `/control/catalog`, then add the SKU code, barcode, box/pack configuration, weight, and active state in its modal.
3. **Pricing** — Select a SKU from `/control/pricing` to open its versioned base and optional compare-at price form. Catalog SKU saves never write money.
4. **Supply** — Select an inventory record from `/control/supply`, or use **Create purchase order**, to update stock and incoming commitments in a modal.
5. **Availability and listing** — Select the product from `/control/storefront/listings` to set `available_now`, `preorder`, `coming_soon`, or `unavailable`, plus optional order windows, release date, merchandising, and customer limits.
6. **Readiness review** — Review product, SKU, current price, supply, availability, and storefront content from the guided product workflow.
7. **Publish** — An administrator with `storefront.publish` makes the final customer-facing decision.

Publication is rejected unless the product is active, an active physical SKU and current price exist, and availability is not `unavailable`. `available_now` also requires inventory above safety stock. New products and listings default to unpublished.

## Pricing and promotions

- `sku_prices` is the versioned pricing source. `booster_box_skus.price_cents`, `msrp_cents`, and `currency` are compatibility caches maintained by a database trigger for existing checkout reads.
- Saving a new current price closes the previous open price and writes an audit record.
- Promotion drafts require `pricing.manage`; activating a promotion additionally requires `pricing.approve`.
- Verify the effective price and eligible promotion in the public product and checkout flows after a change.

## Supply and preorder allocation

- `/control/supply` presents inventory as a bounded work queue. It searches product names, SKUs,
  product IDs, and SKU IDs; filters by attention, sellable, or incoming state; sorts records with
  allocation gaps and no-sellable-stock exceptions first; and preserves the active view across
  pagination. Each row retains exact on-hand, allocated, unallocated, safety-stock, sellable, and
  incoming quantities plus the last update time. Purchase orders show the supplier as the primary
  label, a selectable purchase-order ID, human and system statuses, and exact ordered, received,
  outstanding, expected, and monetary values. Only `received` and `cancelled` purchase orders are
  terminal when the console reports open commitments.
- Inventory adjustments require a reason code and optional reviewer note in the selected `/control/supply` inventory modal.
- **Create purchase order** opens purchase-order intake as a modal and records the order and incoming inventory transactionally.
- Suppliers with open purchase orders cannot be archived.
- Preorder allocation begins with the queue list at `/control/orders/allocations`; selecting a SKU opens the reviewed plan and confirmation in a modal. It requires both `preorders.allocate` and `refunds.manage` because partial allocation can create Stripe refunds.
- Allocation remains FIFO, fingerprints the reviewed queue, rejects stale confirmations, and is idempotent for refunds.

## Orders, finance, and fulfilment

- `/control/orders` is the commercial order context and non-financial lifecycle workspace.
- `/control/finance` owns provider exceptions and manual reconciliation. Selecting an exception or **Create reconciliation** opens the modal form, which requires provider, payment reference, amount, currency, reason, and actor.
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
