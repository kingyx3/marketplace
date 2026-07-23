# Checkout quote contract v1

The application quote is a customer-facing projection; the database checkout
function is the authoritative acceptance boundary.

The application sends only product identifiers, quantities, channel, shipping
address, and the expected subtotal/discount/total snapshot. The database must:

1. reload current products, prices, promotions, shipping policy, and inventory;
2. reject missing, unpublished, unavailable, or over-quantity products;
3. recompute every monetary amount in integer cents;
4. reject any mismatch with the expected snapshot;
5. reserve inventory and create the order in the same transaction.

Neither the browser nor provider return parameters can override the resulting
order, inventory, payment, tax, shipping, or discount values. Changes to the
TypeScript quote shape and `create_checkout_order_from_cart` must update the
same contract tests in one pull request. This is contract version `1`; breaking
changes require a new version and an expand/contract rollout.
