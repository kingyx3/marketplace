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
            Stripe (SGD PayNow PaymentIntents)
```

- **App**: Next.js 16 App Router, TypeScript, React Server Components, and Tailwind CSS v4. UI components are deliberately minimal; shadcn/ui remains a planned polish layer (see `docs/build-plan.md`).
- **Database**: Supabase Postgres. Schema is SQL migrations in `supabase/migrations/` — the single source of truth (`docs/data-model.md`).
- **Auth**: Supabase Auth with Google OAuth. `/auth/sign-in` starts the OAuth flow, `/auth/callback` exchanges the PKCE code, and middleware refreshes Supabase SSR cookies.
- **Payments**: Stripe PaymentIntents normalized by `lib/stripe.ts` to SGD PayNow. Full orders, pre-order deposits, and pre-order balances are immediate single-use payments; incompatible card, reusable-method, setup-future-usage, and manual-capture options are removed before Stripe is called. B2B invoice/PO checkout creates a manual-invoice payment placeholder for staff reconciliation.
- **Catalog/storefront**: catalog products/SKUs are the sellable source of truth; `listing_items` and `storefront_configurations` layer on merchandising state, published visibility, channel metadata, featured/sort order, and catalog copy.
- **Search**: Postgres full-text (GIN index on products). Upgrade path: Typesense or Algolia when the catalog outgrows FTS relevance.
- **Notifications**: provider-agnostic interface (`lib/notifications.ts`). Resend order-confirmation email and email/Telegram/WhatsApp drop alerts are implemented; SMS remains feature-gated by provider configuration.
- **Product media**: Supabase Storage `product-images` bucket is created by migration. Product images are publicly readable; writes are service-role-only behind the server admin gate.
- **Admin operations**: a protected admin surface exists for inventory/catalog/listing operations, B2B review, supplier PO intake, preorder allocation, payment exceptions, and manual reconciliation. It is intentionally still runbook-heavy; see `docs/admin-operations.md`.

## Why this stack

| Requirement | How it's met |
| --- | --- |
| Config source of truth | GitHub Environments own secrets and approval boundaries; Terraform/provider outputs resolve deployment topology. |
| Downstream reconciliation | CI resolves environment values, syncs runtime env to Vercel, and pushes Supabase migrations. |
| Hosted operational model | Vercel and Supabase provide managed compute, database, auth, and storage without application-server operations. |
| Environment separation | Dedicated development and production data projects by default; the optional release topology adds dedicated staging and recovery projects plus a separate staging Vercel project. |
| Config as code | Terraform, migrations, workflows, env contract, and validation. |
| Bootstrap repeatability | One target-aware bootstrap command composes Terraform State Bootstrap, Terraform Platform, Bootstrap Environment, Deploy, and Verify workflows. |

## Infrastructure boundary

Terraform manages provider project shells, not application runtime secrets:

- `infra/terraform/bootstrap` creates/reconciles the GCS Terraform state bucket.
- `infra/terraform/platform` always creates/reconciles the primary Vercel project plus development and production Supabase projects; with `ENABLE_RELEASE_TOPOLOGY=true`, it additionally manages the staging Vercel project plus staging and recovery Supabase projects.
- GitHub Environments hold runtime secrets, operational evidence inputs, and unavoidable manual public values.
- CI resolves Terraform/provider values, reconciles Stripe and hosted auth, generates deploy environment values, syncs runtime keys to Vercel, links Supabase, applies migrations, and deploys.
- Supabase schema and storage/RLS setup are migrations, not Terraform resources.

See `docs/bootstrap.md`, `docs/environments.md`, and `docs/provisioning.md` for the full setup contract.

## Alternatives considered

**GCP Cloud Run + Cloud SQL + Terraform.** Full IaC and no vendor platform lock-in, but Cloud SQL has no genuine scale-to-zero and adds more bootstrap credentials. Right choice later if the business needs VPC-level control.

**Cloudflare Pages/Workers + D1.** Cheapest at scale and excellent edge latency, but D1 lacks the relational depth this data model leans on, and Workers' Node compatibility still complicates Stripe SDK + Supabase SSR usage.

**Hosted platforms (Shopify + wholesale apps).** Fastest to first sale and PCI handled for you, but pre-order deposit/balance flows, allocation rules, B2B tiering, and audited admin state transitions all become app-subscription workarounds.

## Environment topology

The default compact topology has two deployable targets:

- `development` maps to the primary Vercel project and development Supabase project. Pushes to `develop` use this target.
- `production` maps to the primary Vercel project's production deployment target and the production Supabase project. Direct bootstrap supports initial provisioning and full-stack recovery.

The optional extended release topology, enabled with the repository variable `ENABLE_RELEASE_TOPOLOGY=true`, adds:

- `staging`, mapped to a dedicated staging Vercel project and staging Supabase project. Pushes to `main` use this target, and production releases validate the exact revision here first.
- `recovery`, a Terraform-managed Supabase project used by timed restore verification and never passed to the reusable deploy workflow.
- the gated production release path for published releases and `v*` tags.

The reusable deploy workflow derives `TARGET_ENV` from its caller, resolves the matching Terraform outputs and GitHub Environment, syncs runtime values to the environment-specific Vercel project, pushes migrations to the selected Supabase project, deploys or reuses an immutable deployment, and runs smoke/readiness checks.
