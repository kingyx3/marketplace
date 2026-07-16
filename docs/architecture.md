# Architecture

## Overview

```text
Browser ──▶ Vercel (Next.js 16, App Router)
              ├─ Server Components / API routes
              ├─ /api/health           (shallow smoke + deep readiness)
              ├─ /api/webhooks/stripe  (signature-verified, idempotent)
              └─ protected admin/account flows
                    │
                    ▼
            Supabase (managed Postgres)
              ├─ RLS-enforced publishable-key access (catalog, listings, own rows)
              ├─ server-side secret-key access for trusted admin/RPC paths
              ├─ Auth (Google sign-in through Supabase Auth)
              └─ Storage (public product images)
                    ▲
            Stripe (SGD PaymentIntents)
```

- **App**: Next.js 16 App Router, TypeScript, React Server Components, and Tailwind CSS v4.
- **Database**: Supabase Postgres. SQL migrations in `supabase/migrations/` are the schema source of truth.
- **Auth**: Supabase Auth with Google OAuth. `/auth/sign-in` starts the flow, `/auth/callback` exchanges the PKCE code, and middleware refreshes Supabase SSR cookies.
- **Payments**: Stripe PaymentIntents support retail orders, preorder deposits, and preorder balances. Server code derives totals, verifies stock, and records payment state before trusted webhook transitions complete the workflow.
- **Catalog/storefront**: products and SKUs are the sellable source of truth. `listing_items` and `storefront_configurations` add merchandising state, visibility, customer limits, featured order, and concise catalog copy. Deals are time-bounded SKU offers presented inside Catalog.
- **Search**: Postgres full-text search with a GIN index on products. Typesense or Algolia remains an upgrade path if the catalog outgrows Postgres relevance.
- **Notifications**: a provider-agnostic interface supports order confirmations and configured drop-alert channels.
- **Product media**: the Supabase Storage `product-images` bucket is publicly readable; writes remain service-role-only behind the admin gate.
- **Admin operations**: the protected admin surface manages catalog data, listings, deals, inventory, supplier purchase orders, preorder allocation, payment exceptions, and reconciliation.

Wholesale accounts, tier pricing, credit controls, and manual-invoice checkout were retired by the forward migration documented in `docs/data-model.md`.

## Why this stack

| Requirement | How it is met |
| --- | --- |
| Configuration source of truth | GitHub Environments own secrets and approval boundaries; Terraform and provider outputs resolve deployment topology. |
| Downstream reconciliation | CI resolves environment values, syncs runtime configuration to Vercel, and pushes Supabase migrations. |
| Hosted operational model | Vercel and Supabase provide managed compute, database, auth, and storage. |
| Environment separation | Development and production use dedicated data projects; the optional release topology adds staging and recovery. |
| Configuration as code | Terraform, migrations, workflows, the environment contract, and validation remain versioned. |
| Bootstrap repeatability | One target-aware bootstrap command composes infrastructure, environment, deployment, and verification workflows. |

## Infrastructure boundary

Terraform manages provider project shells, not application runtime secrets:

- `infra/terraform/bootstrap` creates or reconciles the GCS Terraform state bucket.
- `infra/terraform/platform` manages the primary Vercel project and development/production Supabase projects; optional release topology adds staging, recovery, and a dedicated staging Vercel project.
- GitHub Environments hold runtime secrets, operational evidence inputs, and unavoidable manual public values.
- CI resolves provider values, reconciles hosted auth and Stripe, syncs Vercel environment values, applies migrations, deploys, and runs readiness checks.
- Supabase schema, storage, and RLS setup remain migrations rather than Terraform resources.

See `docs/bootstrap.md`, `docs/environments.md`, and `docs/provisioning.md` for the complete setup contract.

## Alternatives considered

**GCP Cloud Run + Cloud SQL + Terraform.** This offers deeper network and infrastructure control but adds more operational overhead and persistent database cost.

**Cloudflare Pages/Workers + D1.** This has strong edge characteristics, but D1 does not match the relational and transactional requirements of inventory, preorders, and payments.

**Hosted commerce platforms.** These can accelerate a conventional storefront, but the marketplace relies on custom preorder deposits, allocation, stock controls, audited admin transitions, and server-verified deal pricing.

## Environment topology

The compact topology has two deployable targets:

- `development` maps to the primary Vercel project and development Supabase project.
- `production` maps to the primary Vercel production target and production Supabase project.

The optional release topology, enabled by `ENABLE_RELEASE_TOPOLOGY=true`, adds:

- `staging`, with dedicated Vercel and Supabase projects for release validation.
- `recovery`, a disposable Supabase project used by restore verification.
- a gated production release path for published releases and `v*` tags.

The reusable deploy workflow resolves the target environment, syncs runtime values, applies migrations, deploys or reuses an immutable Vercel deployment, and runs smoke and readiness checks.
