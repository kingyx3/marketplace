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

| Requirement              | How it's met                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| Config source of truth   | GitHub Environments own deploy and runtime configuration           |
| Downstream reconciliation| CI syncs runtime env to Vercel and pushes Supabase migrations      |
| Scale-to-zero cost       | Vercel and Supabase free/low tiers; no always-on servers           |
| Env separation           | Vercel Preview/Production plus separate Supabase projects          |
| Config as code           | Terraform, migrations, workflows, env contract, and validation     |

## Alternatives considered

**GCP Cloud Run + Cloud SQL + Terraform.** Full IaC and no vendor platform
lock-in, but Cloud SQL has no genuine scale-to-zero and adds more bootstrap
credentials. Right choice later if the business needs VPC-level control.

**Cloudflare Pages/Workers + D1.** Cheapest at scale and excellent edge latency,
but D1 lacks the relational depth this data model leans on, and Workers' Node
compat still complicates Stripe SDK + Supabase SSR usage.

**Hosted platforms (Shopify + wholesale apps).** Fastest to first sale and PCI
handled for you, but pre-order deposit/balance flows, allocation rules, and B2B
tiering all become app-subscription workarounds.

## Environment topology

The current hosted topology uses one Vercel project with two targets:
`development` deploys to Vercel Preview, and `production` deploys to Vercel
Production. Supabase remains split by data environment: one development project
and one production project. `staging` is reserved but empty until paid plans
allow a third data environment.

The reusable deploy workflow generates `TARGET_ENV` from its caller input,
validates the matching GitHub Environment, syncs runtime env to the matching
Vercel target, pushes migrations to the selected Supabase project, and deploys.
