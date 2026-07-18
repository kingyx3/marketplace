# Storefront UI boundaries

The customer-facing storefront must show information that helps a customer understand an offer, make a purchase decision, complete an action, or track a transaction.

## Do not expose internal operating details

Do not render badges, banners, helper copy, or labels that describe how the application is implemented or operated. Examples include:

- manual or automated capture flows
- preview fixtures, seed data, test mode, or environment names
- rollout phases, migration states, or temporary implementation constraints
- customer provisioning state or other internal account lifecycle fields
- integration, webhook, reconciliation, or back-office processing modes

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

## Review checklist

Before adding a storefront badge, banner, or status label, confirm that:

1. The state changes a customer decision or next action.
2. The wording describes the customer outcome rather than the implementation.
3. The same information is not already clear from the surrounding page.
4. Internal details remain documented or available to administrators without appearing in public or customer account views.
