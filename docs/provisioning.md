# Provisioning and infrastructure as code

## Current hosted model

GitHub Environments are the source of truth for this repo's deployed config.
The current free-tier setup uses one Vercel project and two Supabase projects:

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview in `marketplace` | dedicated development project | active |
| `staging` | none | none | reserved |
| `production` | Production in `marketplace` | dedicated production project | active |

The manual **Bootstrap Environment** workflow reconciles an active environment
after Terraform and GitHub Environment values exist. It validates the GitHub
contract, syncs runtime env to the matching Vercel target, links Supabase, and
applies migrations. It does not run the regular app deployment job.

## What is code-managed today

- Vercel project shell and Supabase project shells through
  `infra/terraform/platform`.
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

- Terraform creates/imports the shared Vercel project and the active Supabase
  projects.
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

1. Run or import Terraform in `infra/terraform/platform`.
2. Copy Terraform outputs into GitHub Environment variables:
   - `vercel_project_id` into both `development` and `production` as
     `VERCEL_PROJECT_ID`.
   - each `supabase_project_refs[...]` into the matching GitHub Environment as
     `SUPABASE_PROJECT_REF`.
3. Configure dashboard-only provider settings such as Supabase Auth redirect
   URLs and Stripe webhook endpoints.
4. Set the remaining GitHub Environment variables and secrets from
   `docs/environments.md`.
5. Run **Bootstrap Environment** in GitHub Actions for `development` and
   `production`.
6. Confirm `/api/health` and, for production, `/api/health?deep=1` after the
   regular deploy workflow runs.

## Scaling path

When paid plans allow staging, add it by:

1. Adding a `staging` Supabase object to Terraform.
2. Creating/importing the staging Supabase project.
3. Choosing either a Vercel custom environment named `staging` on Pro/Enterprise
   or a separate staging Vercel project.
4. Recreating `.github/workflows/deploy-staging.yml` for pushes to `main`.
5. Extending workflow and env validation to allow `staging`.
6. Filling the `staging` GitHub Environment values and running bootstrap.
