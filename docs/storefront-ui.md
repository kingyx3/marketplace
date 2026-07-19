# Storefront UI boundaries

The customer-facing storefront must show information that helps a customer understand an offer, make a purchase decision, complete an action, or track a transaction.

## Do not expose internal operating details

Do not render badges, banners, helper copy, or labels that describe how the application is implemented or operated. Examples include:

- manual or automated capture flows
- preview fixtures, seed data, test mode, or environment names
- rollout phases, migration states, or temporary implementation constraints
- customer provisioning state or other internal account lifecycle fields
- integration, webhook, reconciliation, or back-office processing modes
- raw on-hand, incoming, allocated, or safety-stock inventory figures

Keep those details in repository documentation, logs, observability, and the role-restricted `/control` console when administrators need them.

## Customer-visible statuses

Status treatments are appropriate when the state directly affects the customer. Examples include:

- stock availability and purchase limits
- deal eligibility and expiry
- order, payment, fulfillment, shipment, and delivery state
- preorder allocation, balance due, cancellation, and refund state
- waitlist or product-notification state
- errors or confirmations that tell the customer what happened and what to do next

Use plain language and avoid implementation terminology. A customer should not need to understand the system architecture to understand the page.

## Out-of-stock and preorder behaviour

Published products remain discoverable when they sell out so customers can review the product and subscribe to an availability alert. Use these rules consistently across the home page, product list, product detail, cart, and checkout:

1. Normal orders use physically sellable stock only: on-hand stock after active allocations and safety stock. Incoming purchase orders are not treated as available for normal checkout.
2. Incoming inventory may support a preorder only while the product is explicitly in `preorder_open` status.
3. Announced, preorder-closed, out-of-print, and sold-out products do not show an enabled purchase action.
4. Sold-out and coming-soon products offer an availability alert where future supply is plausible.
5. Use `In stock` for healthy availability and show an exact quantity only for genuinely low stock. Do not expose warehouse-level figures.
6. Cart lines that become unavailable remain visible so the customer can remove them or reduce the quantity. Checkout is disabled until every line is valid.
7. Adding to cart and starting checkout recheck stock server-side. Starting payment atomically reserves normal-order stock for 15 minutes; expiry or cancellation releases it.
8. If stock changes concurrently, explain that the item sold out or is temporarily reserved and ask the customer to refresh or adjust the cart. Never accept a normal order against incoming inventory.

## Review checklist

Before adding a storefront badge, banner, or status label, confirm that:

1. The state changes a customer decision or next action.
2. The wording describes the customer outcome rather than the implementation.
3. The same information is not already clear from the surrounding page.
4. Internal details remain documented or available to administrators without appearing in public or customer account views.
