# Frontend access and policy contract

This document is the release contract for audience-aware navigation, page protection, promotion visibility, and public policy surfaces.

## Access matrix

| Surface                                               | Public visitor                              | Signed-in customer                           | Active staff                     | Enforcement                                                             |
| ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Home, catalog, product details, wholesale information | Visible                                     | Visible                                      | Visible                          | Public server components; failures degrade to safe empty states         |
| Regular product prices                                | Visible                                     | Visible                                      | Visible                          | Read from active catalog SKUs                                           |
| Deals index                                           | At most three currently active public deals | All currently active public and member deals | Same storefront eligibility      | Supabase RLS plus a public application limit                            |
| Cart                                                  | Visible; checkout requests sign-in          | Visible and eligible deals are revalidated   | Visible                          | Server-side SKU, inventory, price, deal, shipping, and total quote      |
| Account, orders, preorders                            | Sign-in link only; direct access redirects  | Visible for the current customer             | Visible for the current customer | `requireCustomer`; pages are `noindex`                                  |
| Admin navigation                                      | Hidden                                      | Hidden                                       | Visible                          | Active `staff_users` lookup; lookup failure hides privileged navigation |
| Admin routes and actions                              | Redirect to sign-in                         | Access-denied response                       | Visible                          | Shared admin layout and every server action call `requireStaff`         |

UI visibility is not treated as authorization. Privileged database mutations use service-role-only RPCs after the server has verified an active staff row. Deal audience rules are also enforced by database row-level security so hidden member metadata cannot be fetched through an anonymous client.

## Promotion rules

- Regular SKU prices remain public.
- Anonymous deal previews are restricted to active, in-window rows marked `public`, and the deals page displays no more than three.
- Signed-in customers may read active, in-window `public` and `members` deals.
- The server selects the highest eligible deal for each SKU and revalidates it during retail checkout.
- Wholesale tier pricing and limited-time retail deals do not stack.
- Staff schedule actual start and end timestamps; storefront copy must not use invented countdowns, stock warnings, or savings.

## Public policies and consent

The footer links to Privacy, Terms, Cookie, Returns and Refunds, Shipping, Accessibility, and Contact pages. Checkout links the purchase terms before payment. Optional browser tracing and replay require the `marketplace_cookie_consent=analytics` preference; essential session, security, cart, and privacy-scrubbed error reporting remain available without analytics consent.

Production environment validation requires `SUPPORT_EMAIL`. Use an address monitored for customer support, privacy and data-protection requests, and accessibility reports.

## Owner release checks

Before production launch, the operator must:

1. Set `APP_NAME` to the actual contracting operator or approved trading name and publish the correct `SUPPORT_EMAIL`.
2. Have Singapore-qualified counsel review the policy wording, the operator identity, business registration disclosures, return eligibility, liability language, and any sector-specific obligations.
3. Confirm the displayed prices are GST-inclusive whenever the operator is GST-registered.
4. Confirm the live shipping configuration, service area, charges, and return handling match operational practice.
5. Configure only genuine deal windows and substantiated discounts; never use false urgency or misleading reference prices.
6. Re-review policies whenever providers, data uses, countries of processing, delivery coverage, payment methods, or consumer terms change.

This repository can enforce the technical controls and required configuration, but it cannot establish the operator's legal identity or replace legal review.
