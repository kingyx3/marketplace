# Build plan

Honest status ledger. **Nothing listed under "Not built" exists yet** —
docs and README must never describe those as working.

## Built (this scaffold)

- ✅ Next.js 15 app shell; landing + `/catalog` reading live from Postgres
- ✅ `/api/health` smoke endpoint
- ✅ Stripe webhook receiver: signature-verified, idempotent (event ledger)
- ✅ Full commerce schema as SQL migrations, RLS on every table, seed data
- ✅ Allocation engine (`lib/allocation.ts`) — pure logic + unit tests
- ✅ Env contract: `generate-env.mjs`, zod runtime schema, unit tests
- ✅ CI (lint/typecheck/test/build/migrations, parallel, secretless)
- ✅ Deploy pipeline: reusable workflow, 3 environments, env→Vercel sync,
     migration gating, smoke test, production approval gate
- ✅ Production deploy guardrails: `TARGET_ENV` mapping, predeploy app checks,
     migration SQL validation, and smoke tests
- ✅ Docs (`docs/*.md`) + research report (`docs/research/`)
- ✅ Admin operations runbook (`docs/admin-operations.md`) for workflows that
     are not yet productized

## Not built — roadmap

Sequenced to match the 30/60/90-day plan in
`docs/research/14-final-recommendation.md`.

### Phase 1 — sell one box (MVP commerce)

- [ ] Auth flows (Supabase Auth: sign-up/in, customer row provisioning)
- [ ] Product detail page with real images (Supabase Storage)
- [ ] Cart + checkout (server-derived pricing, Stripe PaymentIntent)
- [ ] Webhook → `payments`/`orders` state machine (today it only records)
- [ ] Order confirmation email (Resend adapter — first real notification)
- [ ] Admin: minimal product/inventory CRUD (server-authorized, audited)
- [ ] Admin: order/payment exception queue backed by Stripe reconciliation

### Phase 2 — pre-orders (the differentiator)

- [ ] Pre-order placement with deposit (manual-capture PaymentIntent)
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
