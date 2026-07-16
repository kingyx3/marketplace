# Admin operations

The protected admin surface supports catalog, listing, deal, inventory, supplier purchase-order, preorder-allocation, order, and payment-exception workflows. Production changes should remain reviewable and auditable.

## Operating model

- Git, GitHub Environments, Supabase, Stripe, Vercel, and Terraform hold deployment and provider configuration.
- Runtime commerce data lives in Supabase Postgres.
- Stripe-confirmed state and verified webhooks drive payment transitions. Never mark an order paid from browser-provided state.
- Admin reconciliation requires provider, payment reference, amount, currency, reason, and actor.
- Product, SKU, listing, deal, inventory, purchasing, allocation, refund, payment, and customer-communication changes require review in production.
- Wholesale approval, pricing tiers, credit controls, and manual-invoice checkout are no longer supported.

## Catalog and listings

1. Confirm product, set, SKU, price, currency, stock, visibility, and customer limit.
2. Use the admin catalog forms to create, update, archive, restore, or upload a product image.
3. Use Storefront listings for title overrides, badges, tags, featured order, publish state, customer limits, preorder reserve, and catalog copy.
4. Listings are retail-only. Do not add alternate sales channels directly in the database.
5. Verify the public catalog and product page after the change.

## Deals

1. Confirm the SKU, title, discount, visibility, start, end, and priority.
2. Create or update the deal in `/admin/deals`.
3. Confirm the offer appears under `/catalog?view=deals` for the intended audience.
4. Verify checkout applies the best eligible active deal from current server data.

## Inventory correction

1. Confirm the SKU and physical or supplier-backed quantity.
2. Use the protected inventory form and select the closest reason code.
3. Verify `allocated <= on_hand + incoming` remains true.
4. Do not separately adjust incoming stock for a purchase order already recorded through the PO form.

## Supplier purchase-order intake

1. Confirm supplier, SKU, quantity, unit cost, currency, expected date, and reviewer approval.
2. Record the PO through the protected admin form.
3. Confirm the PO appears and incoming inventory increases by the recorded quantity.
4. Keep supplier setup and maintenance as reviewed service-role changes until dedicated CRUD is implemented.

## Preorder allocation

1. Confirm incoming stock, safety stock, customer limits, and current preorder data.
2. Run the SKU-scoped allocation action from Admin only after inventory is current.
3. Allocation is retail FIFO and only considers outstanding quantity.
4. Customers pay allocated balances through the authenticated Stripe balance-payment flow.
5. Record partial fills or skipped customers for support follow-up.

## Payment or webhook exception

1. Find the Stripe event or payment reference.
2. Confirm webhook state in `webhook_events` and payment state in `payments`.
3. Preserve idempotency when retrying verified events.
4. Use the admin reconciliation form when a reviewed manual correction is unavoidable.
5. Use the payment-exception queue for stale, orphaned, failed, or manually flagged cases.

## Drop alerts

1. Confirm the SKU is active and has on-hand or incoming availability.
2. Confirm the selected provider is configured in the target GitHub Environment.
3. Use the staff-only waitlist notification API.
4. Review failed or skipped notification rows; do not bypass dedupe state by sending directly from provider dashboards.

## Deploy incident

1. Pause production approval in the GitHub Environment.
2. Roll back the Vercel deployment when the application revision caused the issue.
3. Correct schema mistakes with a new forward migration; never edit an applied migration.
4. Reconcile environment configuration and rerun deployment.
5. Re-run the relevant provider workflow or environment bootstrap when external provider settings changed.

## Backlog

- Supplier management UI beyond purchase-order intake
- Rich audit views for stock, orders, payments, providers, listings, and configuration
- Sell-through, margin, and preorder-conversion analytics
- Deeper allocation review and customer communication tools
- Expanded authenticated admin, RLS, Stripe, and provider integration coverage
