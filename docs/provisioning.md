# Provisioning and infrastructure as code

## Current hosted model

GitHub Environments are the source of truth for this repo's deployed config.
The current free-tier setup uses two hosted project pairs:

| GitHub Environment | Vercel project | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | dedicated development project | dedicated development project | active |
| `staging` | none | none | reserved |
| `production` | dedicated production project | dedicated production project | active |

The manual **Bootstrap Environment** workflow reconciles an active environment
after the provider projects and GitHub Environment values exist. It validates the
GitHub contract, syncs runtime env to Vercel, links the Supabase project, pushes
migrations, deploys, and smoke tests.

## What is code-managed today

- Vercel and Supabase project shells through `infra/terraform/platform`.
- Next.js/Vercel build and headers through `vercel.json`.
- Runtime env contract through `.env.example`, `scripts/generate-env.mjs`, and
  `lib/env.ts`.
- Vercel runtime env reconciliation through `scripts/sync-vercel-env.mjs`.
- Supabase schema, RLS, storage bucket, grants, and seed data through
  `supabase/migrations` and `supabase/seed.sql`.
- Deployment wiring through `.github/workflows/deploy*.yml` and
  `.github/workflows/bootstrap-environment.yml`.

## Terraform state

Use HCP Terraform for remote state. Each HCP Terraform workspace stores separate
state and state history, so state files do not belong in this repo. The platform
stack includes `infra/terraform/platform/state.tf.example`; copy it to
`state.tf`, set your HCP Terraform organization, and leave `state.tf` untracked.

## Terraform boundary

Vercel and Supabase both have Terraform providers. This repo uses Terraform for
provider project shells now and can expand later to domains and selected
non-secret settings.

Recommended boundary:

- Terraform may create/import Vercel projects, Vercel domains, Supabase projects,
  and non-secret provider settings.
- GitHub Environments remain the source of truth for runtime values used by this
  app, especially secrets.
- Avoid putting runtime application secrets into Terraform-managed Vercel env
  resources. Let CI sync those from GitHub Environments instead.
- The Supabase project database credential is required for project creation and
  will be present in Terraform state; use HCP Terraform with strict access.
- Database schema still belongs in Supabase migrations, not Terraform.

Do not duplicate ownership: if Terraform manages a Vercel environment variable,
remove it from the GitHub-owned sync contract, and vice versa.

## Bootstrap checklist

For each active environment:

1. Run or import Terraform in `infra/terraform/platform` for `development` and
   `production`.
2. Copy Terraform outputs into the matching GitHub Environment variables:
   `VERCEL_PROJECT_ID` and `SUPABASE_PROJECT_REF`.
3. Configure dashboard-only provider settings such as Supabase Auth redirect
   URLs and Stripe webhook endpoints.
4. Set the remaining GitHub Environment variables and secrets from
   `docs/environments.md`.
5. Run **Bootstrap Environment** in GitHub Actions for `development` and
   `production`.
6. Confirm `/api/health` and, for production, `/api/health?deep=1`.

## Scaling path

When paid plans allow a third hosted project pair, add `staging` by:

1. Adding a `staging` object to the Terraform environments map.
2. Creating/importing the staging Vercel and Supabase projects.
3. Recreating `.github/workflows/deploy-staging.yml` for pushes to `main`.
4. Extending workflow and env validation to allow `staging`.
5. Filling the `staging` GitHub Environment values and running bootstrap.
