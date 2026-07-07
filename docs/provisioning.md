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

- GCS Terraform state bucket through `infra/terraform/bootstrap`.
- Vercel project shell and Supabase project shells through
  `infra/terraform/platform`.
- Runtime env contract through `.env.example`, `scripts/generate-env.mjs`, and
  `lib/env.ts`.
- Vercel runtime env reconciliation through `scripts/sync-vercel-env.mjs`.
- Supabase schema and seed data through `supabase/migrations` and
  `supabase/seed.sql`.
- Deployment wiring through `.github/workflows/*.yml`.

## Terraform state

Use Google Cloud Storage for remote Terraform state. The GCS state bucket is
created by the **Terraform State Bootstrap** workflow from CI/CD variables. The
bootstrap stack uses local state because the remote backend does not exist until
that first bucket has been created. On reruns, CI imports the existing bucket
before planning so the bucket settings can still be reconciled.

Recommended bucket settings are encoded in Terraform:

- Location: `us-central1` by default
- Storage class: Standard
- Public access prevention: enforced
- Uniform bucket-level access: enabled
- Object versioning: enabled

The platform stack has a committed empty `backend "gcs" {}` block. The
**Terraform Platform** workflow passes the real bucket and prefix at
`terraform init` time.

## CI/CD inputs

Set the repository variables and secrets referenced by these workflows:

- `.github/workflows/terraform-state-bootstrap.yml`
- `.github/workflows/terraform-platform.yml`

Those workflows pass provider settings, backend settings, and Terraform variables
through CI/CD as environment variables. Do not commit real `terraform.tfvars` or
backend override files.

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
  will be present in Terraform state; keep the GCS bucket private and locked down.
- Database schema still belongs in Supabase migrations, not Terraform.

Do not duplicate ownership: if Terraform manages a Vercel environment variable,
remove it from the GitHub-owned sync contract, and vice versa.

## Bootstrap checklist

1. Set the CI/CD variables and secrets referenced by the Terraform workflows.
2. Run **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=true`.
4. Copy Terraform outputs into GitHub Environment variables:
   - `vercel_project_id` into both `development` and `production` as
     `VERCEL_PROJECT_ID`.
   - each `supabase_project_refs[...]` into the matching GitHub Environment as
     `SUPABASE_PROJECT_REF`.
5. Configure dashboard-only provider settings such as Supabase Auth redirect
   URLs and Stripe webhook endpoints.
6. Set the remaining GitHub Environment variables and secrets from
   `docs/environments.md`.
7. Run **Bootstrap Environment** in GitHub Actions for `development` and
   `production`.
8. Confirm `/api/health` and, for production, `/api/health?deep=1` after the
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
