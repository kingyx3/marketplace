# Build plan

Honest status ledger. **Unchecked roadmap items are not built yet** —
docs and README must never describe those as working.

## Built (this scaffold)

- ✅ Next.js 15 app shell; landing, `/catalog`, and product detail pages
  reading live catalog rows from Postgres with fixture/image fallbacks
- ✅ Google-only Supabase Auth routes, session refresh middleware, sign-out,
  customer row provisioning with first-signup welcome messaging,
  protected account/admin pages, and
  authenticated account/order/pre-order APIs
- ✅ Cookie cart helpers and server-side checkout validation for SKU,
  quantity, inventory, currency, B2B eligibility, tier discounts, and
  server-derived totals
- ✅ Checkout order RPC with atomic inventory allocation, persisted discounts,
  expected subtotal/total checks, and Stripe amount/currency verification
  before an order can become `paid`
- ✅ Live account dashboard and customer order/pre-order pages backed by
  Supabase rows, plus order/pre-order list/detail APIs, B2B application
  endpoint, staff-gated admin inventory/order/pre-order APIs, and an
  operator inventory page
- ✅ `/api/health` smoke endpoint plus `/api/health?deep=1` readiness
  checks for Supabase, Stripe config, and notification channel status
- ✅ Stripe webhook receiver: signature-verified, idempotent (event ledger),
  with guarded payment/order/refund state transitions
- ✅ Full commerce schema as SQL migrations, RLS on every table, seed data
- ✅ Allocation engine (`lib/allocation.ts`) — pure logic + unit tests
- ✅ Env contract: `generate-env.mjs`, zod runtime schema, `APP_NAME`
  display-name propagation, and unit tests
- ✅ CI (lint/typecheck/test/build/migrations, parallel, secretless)
- ✅ Deploy pipeline: reusable workflow, 3 environments, env→Vercel sync,
  migration gating, smoke test, production approval gate
- ✅ Config-as-code checks for Vercel and Supabase: `vercel.json`
  security/cache headers, product image storage bucket/policies in SQL,
  and verifier scripts covered by CI
- ✅ Admin supplier purchase-order intake: service-role-only RPC records
  confirmed supplier POs, line items, incoming inventory deltas, and audit
  records from the protected admin page
- ✅ Admin B2B pricing-tier removal: service-role-only RPC removes assigned
  tiers, records the staff actor, and lets the existing checkout gate disable
  wholesale access when no tier remains
- ✅ Production deploy guardrails: `TARGET_ENV` mapping, predeploy app checks,
  migration SQL validation, and smoke tests
- ✅ Docs (`docs/*.md`) + research report (`docs/research/`)
- ✅ Explicit Supabase Data API grants paired with RLS policies for the public
  catalog and authenticated own-row reads
- ✅ Admin operations runbook (`docs/admin-operations.md`) for workflows that
  are not yet productized

## Roadmap status

Sequenced to match the 30/60/90-day plan in
`docs/research/14-final-recommendation.md`.

### Phase 1 — sell one box (MVP commerce)

- [x] Auth flows (Supabase Auth: Google sign-in/out, session handling,
      customer row provisioning)
- [x] Product detail page backed by database catalog rows
- [x] Supabase Storage `product-images` bucket and RLS policies for public
      image reads plus staff/service-role writes
- [x] Cart + checkout backend and browser PaymentIntent confirmation UI
      (server-derived pricing, inventory checks, Stripe Elements, retry/cancel
      states, and cart clearing only after confirmed client-side success)
- [x] Webhook → `payments`/`orders` state machine for successful, failed,
      authorized, and refunded Stripe events
- [x] Order confirmation email via Resend, with notification-row dedupe,
      provider-message tracking, disabled-provider skip state, and
      failure recording that does not roll back paid orders
- [ ] Admin: complete product/inventory CRUD (inventory update exists; product
      create/update/delete, image upload UI, and richer validation are still TODO)
- [x] Admin API: explicit order/payment actions for packing, shipping,
      unpaid cancellation, manual reconciliation, and payment exception
      flagging; generic order `status` PATCH is removed
- [x] Admin API: order/payment exception queue backed by persisted manual
      flags plus derived stale/orphan/failed-payment signals
- [x] Admin UI: live order/payment exception queue visibility
- [x] Admin UI: reconciliation console for manual payment correction through
      the audited admin order action path

### Phase 2 — pre-orders (the differentiator)

- [x] Storefront pre-order placement flow around the deposit API
      (product detail starts a server-priced Stripe Elements deposit flow)
- [x] Pre-order deposit PaymentIntent API primitive with manual capture and
      persisted pre-order/payment rows
- [x] Allocation run: `lib/allocation.ts` reads live inventory/rules and
      persists allocation deltas through a guarded database function
- [x] Balance capture + pre-order conversion via authenticated balance
      PaymentIntent API and idempotent Stripe webhook conversion
- [x] Customer pre-order dashboard (read-only status, allocated quantity,
      deposit, and balance due from live rows)
- [ ] Waitlist + drop notifications (Telegram/WhatsApp adapters)

### Phase 3 — B2B/wholesale

- [x] Customer B2B application page plus server-side approved-account
      channel gate, assigned-tier pricing, visible wholesale prices, and
      minimum-order enforcement in quote/checkout
- [x] Admin B2B application review list, rejection flow, and approval with
      required pricing-tier assignment
- [x] Tier pricing visible on catalog/product/cart before checkout for
      approved accounts with assigned tiers
- [ ] Invoice/PO-style checkout (Stripe invoices or bank transfer + manual confirm)
- [x] Supplier purchase-order intake updating `incoming` stock
- [x] Admin: B2B pricing-tier removal

### Phase 4 — scale & polish

- [ ] shadcn/ui component layer; proper design pass
- [ ] Search upgrade (Typesense/Algolia) when FTS relevance fails
- [ ] Integration tests: RLS assertions, Stripe flows, Playwright smoke
- [ ] Analytics/metrics dashboard (sell-through, margin, preorder conversion)
- [ ] Shipping-rate integration (SingPost/Ninja Van/J&T APIs)

## Deferred decisions

- Multi-currency display (schema-ready; UI later)
- Marketplace/consignment for singles (out of scope: sealed-first strategy)
- GCP/Terraform migration (docs/architecture.md — only if we outgrow Vercel/Supabase)

## Admin workflow status

The protected admin page now covers live inventory updates, preorder
allocation, payment-exception visibility, purchase-order visibility, and
B2B approval/rejection with pricing-tier assignment, and manual payment
reconciliation from the exception queue. Supplier PO intake records a
confirmed PO and increments incoming stock through an audited service-role
RPC, and assigned B2B pricing tiers can be removed through an audited
service-role action. Product/SKU CRUD is still a manual, reviewed workflow
tracked above and in `docs/admin-operations.md`.
