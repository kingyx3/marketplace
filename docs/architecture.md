# Architecture

## Overview

```text
Browser ──▶ Vercel (Next.js 15, App Router)
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

- **App**: Next.js 15 App Router, TypeScript, React Server Components, Tailwind CSS v4. UI components are deliberately minimal; shadcn/ui is still a planned polish layer (see `docs/build-plan.md`).
- **Database**: Supabase Postgres. Schema is SQL migrations in `supabase/migrations/` — the single source of truth (`docs/data-model.md`).
- **Auth**: Supabase Auth with Google OAuth. `/auth/sign-in` starts the OAuth flow, `/auth/callback` exchanges the PKCE code, and middleware refreshes Supabase SSR cookies.
- **Payments**: Stripe PaymentIntents normalized by `lib/stripe.ts` to SGD PayNow. Full orders, pre-order deposits, and pre-order balances are immediate single-use payments; incompatible card, reusable-method, setup-future-usage, and manual-capture options are removed before Stripe is called. B2B invoice/PO checkout creates a manual-invoice payment placeholder for staff reconciliation.
- **Catalog/storefront**: catalog products/SKUs are the sellable source of truth; `listing_items` and `storefront_configurations` layer on merchandising state, published visibility, channel metadata, featured/sort order, and catalog copy.
- **Search**: Postgres full-text (GIN index on products). Upgrade path: Typesense or Algolia when the catalog outgrows FTS relevance.
- **Notifications**: provider-agnostic interface (`lib/notifications.ts`). Resend order-confirmation email and email/Telegram/WhatsApp drop alerts are implemented; SMS remains feature-gated by provider configuration.
- **Product media**: Supabase Storage `product-images` bucket is created by migration. Product images are publicly readable; writes require trusted server code or an authenticated active staff user.
- **Admin operations**: a protected admin surface exists for inventory/catalog/listing operations, B2B review, supplier PO intake, preorder allocation, payment exceptions, and manual reconciliation. It is intentionally still runbook-heavy; see `docs/admin-operations.md`.

## Why this stack

| Requirement | How it's met |
| --- | --- |
| Config source of truth | GitHub Environments own secrets and approval boundaries; Terraform/provider outputs resolve deployment topology. |
| Downstream reconciliation | CI resolves environment values, syncs runtime env to Vercel, and pushes Supabase migrations. |
| Scale-to-zero cost | Vercel and Supabase free/low tiers; no always-on app servers. |
| Env separation | Vercel Preview/Production plus separate Supabase projects. |
| Config as code | Terraform, migrations, workflows, env contract, and validation. |
| Bootstrap repeatability | Terraform State Bootstrap, Terraform Platform, Configure Providers, output resolver, and Bootstrap Environment workflows. |

## Infrastructure boundary

Terraform manages provider project shells, not application runtime secrets:

- `infra/terraform/bootstrap` creates/reconciles the GCS Terraform state bucket.
- `infra/terraform/platform` creates/reconciles one Vercel project and the active Supabase projects.
- GitHub Environments hold runtime secrets and unavoidable manual public values.
- CI resolves Terraform/provider values, reconciles Stripe, generates `.env.deploy`, syncs runtime keys to Vercel, links Supabase, applies migrations, and deploys.
- Supabase schema and storage/RLS setup are migrations, not Terraform resources.

See `docs/bootstrap.md`, `docs/environments.md`, and `docs/provisioning.md` for the full setup contract.

## Alternatives considered

**GCP Cloud Run + Cloud SQL + Terraform.** Full IaC and no vendor platform lock-in, but Cloud SQL has no genuine scale-to-zero and adds more bootstrap credentials. Right choice later if the business needs VPC-level control.

**Cloudflare Pages/Workers + D1.** Cheapest at scale and excellent edge latency, but D1 lacks the relational depth this data model leans on, and Workers' Node compat still complicates Stripe SDK + Supabase SSR usage.

**Hosted platforms (Shopify + wholesale apps).** Fastest to first sale and PCI handled for you, but pre-order deposit/balance flows, allocation rules, B2B tiering, and audited admin state transitions all become app-subscription workarounds.

## Environment topology

The current hosted topology uses one Vercel project with two targets: `development` deploys to Vercel Preview, and `production` deploys to Vercel Production. Supabase remains split by data environment: one development project and one production project. `staging` is reserved but empty until paid plans allow a third data environment.

The reusable deploy workflow generates `TARGET_ENV` from its caller input, validates the matching GitHub Environment, syncs runtime env to the matching Vercel target, pushes migrations to the selected Supabase project, deploys, and smoke tests.
