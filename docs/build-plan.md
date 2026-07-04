# Build plan

Honest status ledger. **Unchecked roadmap items are not built yet** —
docs and README must never describe those as working.

## Built (this scaffold)

- ✅ Next.js 15 app shell; landing, `/catalog`, and product detail pages
     reading live catalog rows from Postgres with fixture/image fallbacks
- ✅ Google-only Supabase Auth routes, session refresh middleware, sign-out,
     customer row provisioning, protected account/admin pages, and
     authenticated account/order/pre-order APIs
- ✅ Cookie cart helpers and server-side checkout validation for SKU,
     quantity, inventory, currency, B2B eligibility, tier discounts, and
     server-derived totals
- ✅ Checkout order RPC with atomic inventory allocation, persisted discounts,
     expected subtotal/total checks, and Stripe amount/currency verification
     before an order can become `paid`
- ✅ Basic account dashboard, order/pre-order list/detail APIs, B2B
     application endpoint, staff-gated admin inventory/order/pre-order APIs,
     and an operator inventory page
- ✅ `/api/health` smoke endpoint
- ✅ Stripe webhook receiver: signature-verified, idempotent (event ledger),
     with guarded payment/order/refund state transitions
- ✅ Full commerce schema as SQL migrations, RLS on every table, seed data
- ✅ Allocation engine (`lib/allocation.ts`) — pure logic + unit tests
- ✅ Env contract: `generate-env.mjs`, zod runtime schema, unit tests
- ✅ CI (lint/typecheck/test/build/migrations, parallel, secretless)
- ✅ Deploy pipeline: reusable workflow, 3 environments, env→Vercel sync,
     migration gating, smoke test, production approval gate
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
- [x] Product detail page backed by database catalog rows (Supabase Storage
      product-image workflow still TODO)
- [x] Cart + checkout backend (server-derived pricing, inventory checks,
      Stripe PaymentIntent API, and guarded Stripe Checkout Session UI path)
- [ ] Browser PaymentIntent confirmation UI using Stripe.js/Elements; the
      backend API returns client secrets but the storefront cart still redirects
      through Stripe Checkout Session for B2C orders.
- [x] Webhook → `payments`/`orders` state machine for successful, failed,
      authorized, and refunded Stripe events
- [ ] Order confirmation email (Resend adapter — first real notification)
- [ ] Admin: complete product/inventory CRUD (inventory update exists; product
      create/update/delete and richer validation are still TODO)
- [ ] Admin: order/payment exception queue backed by Stripe reconciliation

### Phase 2 — pre-orders (the differentiator)

- [ ] Storefront pre-order placement flow around the deposit API
- [x] Pre-order deposit PaymentIntent API primitive with manual capture and
      persisted pre-order/payment rows
- [ ] Allocation run: wire `lib/allocation.ts` to inventory + rules
- [ ] Balance capture + pre-order → order conversion
- [ ] Customer pre-order dashboard (status, balance due)
- [ ] Waitlist + drop notifications (Telegram/WhatsApp adapters)

### Phase 3 — B2B/wholesale

- [ ] B2B application + approval flow
- [ ] Tier pricing on catalog + carted minimums
- [ ] Invoice/PO-style checkout (Stripe invoices or bank transfer + manual confirm)
- [ ] Supplier purchase-order intake updating `incoming` stock
- [ ] Admin: B2B approval, pricing-tier assignment, and purchase-order tools

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

Admin operations are documented but not built as a product surface. Until
the admin UI exists, production admin changes are manual, reviewed, and
traceable through `docs/admin-operations.md`.
