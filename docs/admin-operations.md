# Control operations

The protected `/control` console supports catalog, category, set, listing, deal, inventory, supplier, purchase-order, preorder-allocation, order, payment-exception, administrator, and audit workflows. It is intentionally absent from storefront navigation and is protected on every server-rendered page and mutation.

## Access model

- Emails in `ADMIN_EMAIL_ALLOWLIST` are authoritative environment owners. They are normalized case-insensitively, synchronized as active `owner` staff records, and managed through the GitHub repository variable rather than the UI.
- An active `admin` or `owner` may add another email under `/control/administrators` and assign a scoped role.
- A delegated administrator receives access after signing in with the exact normalized email. First sign-in binds the grant to the Supabase auth user and provisions the corresponding `staff_users` row.
- Revoked database-managed staff remain denied. Environment owners cannot be revoked or demoted through the console.
- The final active owner cannot remove or demote themself.
- Roles follow least privilege: `viewer`, `support`, `catalog`, `operations`, `admin`, and `owner`.

## Operating model

- Git, GitHub Environments, Supabase, Stripe, Vercel, and Terraform hold deployment and provider configuration.
- Runtime commerce data lives in Supabase Postgres.
- Stripe-confirmed state and verified webhooks drive payment transitions. Never mark an order paid from browser-provided state.
- Admin reconciliation requires provider, payment reference, amount, currency, reason, and actor.
- Product, SKU, category, set, listing, deal, inventory, supplier, purchasing, allocation, refund, payment, administrator, and customer-communication changes require review in production.
- Significant control changes write explicit records to `audit_logs`; core table triggers retain before-and-after row images.

## Categories and sets

1. Create and maintain categories under `/control/categories`.
2. Use a parent category only when the relationship is meaningful. The database rejects self-parenting and recursive cycles.
3. Archive dependent child categories, sets, and products before archiving their parent category.
4. Manage releases under `/control/sets`, including category, code, release date, preorder window, lifecycle status, ordering, and active state.
5. A set with active products cannot be archived.
6. Verify affected catalog filters and product pages after changing relationships or publication state.

## Catalog and listings

1. Confirm product, set, SKU, price, currency, stock, visibility, and customer limit.
2. Use `/control/operations` to create, update, archive, restore, or upload a product image.
3. Use `/control/listings` for title overrides, badges, tags, featured order, publish state, customer limits, preorder reserve, and catalog copy.
4. Listings are retail-only. Do not add alternate sales channels directly in the database.
5. Verify the public catalog and product page after the change.

## Deals

1. Confirm the SKU, title, discount, visibility, start, end, and priority.
2. Create or update the deal in `/control/deals`.
3. Confirm the offer appears under `/catalog?view=deals` for the intended audience.
4. Verify checkout applies the best eligible active deal from current server data.

## Suppliers and purchase orders

1. Create and maintain supplier contact, region, type, payment terms, minimum order, currency, notes, and active state under `/control/suppliers`.
2. A supplier with an open purchase order cannot be archived. Complete or cancel the dependent order first.
3. Confirm supplier, SKU, quantity, unit cost, currency, expected date, and reviewer approval before recording a purchase order.
4. Record the purchase order through `/control/operations`.
5. Confirm the purchase order appears and incoming inventory increases by the recorded quantity.

## Inventory correction

1. Confirm the SKU and physical or supplier-backed quantity.
2. Use the protected inventory form under `/control/operations` and select the closest reason code.
3. Verify `allocated <= on_hand + incoming` remains true.
4. Do not separately adjust incoming stock for a purchase order already recorded through the PO form.

## Preorder allocation

1. Confirm incoming stock, safety stock, customer limits, and current preorder data.
2. Run the SKU-scoped allocation action from `/control/operations` only after inventory is current.
3. Allocation is retail FIFO and only considers outstanding quantity.
4. Customers pay allocated balances through the authenticated Stripe balance-payment flow.
5. Record partial fills or skipped customers for support follow-up.

## Payment or webhook exception

1. Find the Stripe event or payment reference.
2. Confirm webhook state in `webhook_events` and payment state in `payments`.
3. Preserve idempotency when retrying verified events.
4. Use the reconciliation form under `/control/operations` when a reviewed manual correction is unavoidable.
5. Use the payment-exception queue for stale, orphaned, failed, or manually flagged cases.

## Audit review

1. Review recent explicit administrative actions under `/control/audit`.
2. Confirm the actor, action, target table, record identifier, timestamp, and safe summary.
3. Use the protected database audit record for detailed before-and-after analysis; the UI intentionally omits arbitrary or sensitive fields.
4. Never copy secrets, payment credentials, tokens, or unnecessary personal information into notes or logs.

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

## Remaining enhancements

- Sell-through, margin, and preorder-conversion analytics
- Deeper allocation review and customer communication tools
- Fine-grained per-action permission overrides beyond the current role matrix
- Expanded authenticated administrator, RLS, Stripe, and provider integration coverage