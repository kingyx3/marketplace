# Architecture

## Overview

```
Browser ──▶ Vercel (Next.js 15, App Router)
              ├─ Server Components / API routes
              ├─ /api/health           (shallow smoke + deep readiness)
              └─ /api/webhooks/stripe  (signature-verified, idempotent)
                    │
                    ▼
            Supabase (managed Postgres)
              ├─ RLS-enforced anon access (catalog, own orders)
              ├─ Auth (customer accounts)
              └─ Storage (public product images)
                    ▲
            Stripe (PaymentIntents, manual capture for pre-orders)
```

- **App**: Next.js 15 App Router, TypeScript, React Server Components,
  Tailwind CSS v4. UI components are deliberately minimal; shadcn/ui is
  the planned component layer (see `docs/build-plan.md`).
- **Database**: Supabase Postgres. Schema is SQL migrations in
  `supabase/migrations/` — the single source of truth (`docs/data-model.md`).
- **Payments**: Stripe PaymentIntents. B2C order payments capture
  normally; pre-order deposits use **manual capture** so funds can be
  authorized now and captured at allocation.
- **Search**: Postgres full-text (GIN index on products). Upgrade path:
  Typesense or Algolia when the catalog outgrows FTS relevance.
- **Notifications**: provider-agnostic interface (`lib/notifications.ts`).
  Resend order-confirmation email is implemented; SMS, Telegram, and
  WhatsApp remain feature-gated stubs.
- **Product media**: Supabase Storage `product-images` bucket is created
  by migration. Product images are publicly readable; writes require
  service-role server code or an authenticated active staff user.
- **Admin operations**: no browser admin console exists yet. Production
  admin work follows `docs/admin-operations.md` until the protected admin
  UI is built.

## Why this stack

| Requirement               | How it's met                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| Minimal secrets to deploy | Required secrets + vars per environment (docs/environments.md)    |
| `.env` generated in CI    | `scripts/generate-env.mjs` from GitHub Environment values         |
| Scale-to-zero cost        | Vercel and Supabase free/low tiers; no always-on servers          |
| Env separation            | GitHub Environments → separate Supabase projects + Vercel targets |
| Config as code            | Migrations, workflows, env contract all in-repo                   |

## Alternatives considered

**GCP Cloud Run + Cloud SQL + Terraform.** Full IaC and no vendor
platform lock-in, but: Cloud SQL has no genuine scale-to-zero (a small
instance idles at ~US$10–30/mo per environment), Terraform state needs a
backend + bootstrap credentials (more secrets, not fewer), and the
GitHub-secrets surface roughly doubles (service-account JSON, project
ids, registry auth). Right choice later if the business needs VPC-level
control or leaves the Vercel/Supabase envelope.

**Cloudflare Pages/Workers + D1.** Cheapest at scale and excellent edge
latency, but D1 (SQLite) lacks the relational depth this data model
leans on (enums, triggers, RLS, generated columns), and Workers'
Node-compat still complicates Stripe SDK + Supabase SSR usage. Good CDN
layer in front of Vercel later; not the primary platform now.

**Hosted platforms (Shopify + wholesale apps).** Fastest to first sale
and PCI handled for you, but pre-order deposit/balance flows, allocation
rules, and B2B tiering all become app-subscription workarounds; margins
on booster boxes are thin enough that platform + app fees bite. The
research report (docs/research/08-technical-implementation.md) covers
this trade-off in depth — including the recommendation to _validate_
demand on a hosted platform if speed matters more than control.

## Environment topology

One Supabase project and one Vercel project per environment
(`development`, `staging`, `production`). Nothing is shared across
environments — separate databases, separate Stripe modes (test keys in
dev/staging, live keys only in production), separate URLs.

`TARGET_ENV` in each GitHub Environment must match the reusable deploy
workflow input. The deploy fails before migrations or Vercel changes if
that mapping drifts.
