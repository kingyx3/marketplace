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
              ├─ RLS-enforced publishable-key access (catalog, own orders)
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
  Resend order-confirmation email and email/Telegram/WhatsApp drop
  alerts are implemented; SMS remains a feature-gated stub.
- **Product media**: Supabase Storage `product-images` bucket is created
  by migration. Product images are publicly readable; writes require
  trusted server code or an authenticated active staff user.
- **Admin operations**: no browser admin console exists yet. Production
  admin work follows `docs/admin-operations.md` until the protected admin
  UI is built.

## Why this stack

| Requirement               | How it's met                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| Minimal secrets to deploy | GitHub stores only deploy/migration credentials                   |
| Runtime config ownership  | Vercel Project Environment Variables own provider runtime values  |
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

The reusable deploy workflow generates `TARGET_ENV` from its caller input and
validates it before migrations or Vercel changes run. Runtime Supabase keys use
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Vercel, not
legacy anon/service-role API key env names.
