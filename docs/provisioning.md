# Provisioning and infrastructure as code

## Current hosted model

GitHub Environments are the source of truth for this repo's deployed config. The current free-tier setup uses one shared Vercel project and two hosted Supabase projects:

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview in the shared Vercel project | Generated/imported as the development project | Active |
| `staging` | None | None | Reserved |
| `production` | Production in the shared Vercel project | Generated/imported as the production project | Active |

The manual **Bootstrap Environment** workflow reconciles an active environment after Terraform and GitHub Environment values exist. It validates the GitHub contract, syncs runtime env to the matching Vercel target, links Supabase, and applies migrations. It does not run the regular app deployment job.

For the complete operator sequence, use [`docs/bootstrap.md`](bootstrap.md). This file explains the infrastructure boundary and where values come from.

## What is code-managed today

- GCS Terraform state bucket through `infra/terraform/bootstrap`.
- Vercel project shell and active Supabase project shells through `infra/terraform/platform`.
- Runtime env contract through `.env.example`, `scripts/generate-env.mjs`, and `lib/env.ts`.
- Vercel runtime env reconciliation through `scripts/sync-vercel-env.mjs`.
- Hosted Supabase Google Auth provider enablement through `scripts/configure-google-oauth.mjs` and `.github/workflows/configure-google-oauth.yml`.
- Supabase schema, seed data, storage bucket, grants, RLS policies, and RPCs through `supabase/migrations` and `supabase/seed.sql`.
- Deployment wiring through `.github/workflows/*.yml`.

## What remains dashboard-managed

The repo intentionally does not create or fully manage every external setting:

- GitHub repository secrets, repository variables, and GitHub Environment variables/secrets are entered in GitHub.
- GitHub Environment protection rules, especially production required reviewers, are configured in GitHub.
- Google Cloud OAuth clients, consent screen settings, audience, and verification are configured in Google Cloud.
- Hosted Supabase redirect allow-list entries may require dashboard edits, depending on the project.
- Stripe webhook endpoints, live-mode account activation, taxes, disputes, and payment-method settings are configured in Stripe.
- Optional notification-provider sender/domain verification is configured in each provider dashboard.

## Terraform state

Use Google Cloud Storage for remote Terraform state. The GCS state bucket is created by the **Terraform State Bootstrap** workflow. The bucket name is derived from the GCP project id and project slug unless `TF_STATE_BUCKET_NAME` is set.

Recommended bucket settings are encoded in Terraform:

- Location: `us-central1` by default
- Storage class: Standard
- Public access prevention: enforced
- Uniform bucket-level access: enabled
- Object versioning: enabled

The platform stack has a committed empty `backend "gcs" {}` block. The **Terraform Platform** workflow passes the real bucket and prefix at `terraform init` time.

The generated Supabase database passwords are present in Terraform state. Keep the GCS bucket private and locked down. The current deploy workflows still need the matching password copied into each GitHub Environment as `SUPABASE_DB_PASSWORD` so `supabase link` can run.

## Terraform workflows and inputs

### Required repository secrets

| Secret | Workflow | Purpose |
| --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | State + platform | Google Cloud service account JSON for the state bucket project. |
| `VERCEL_API_TOKEN` | Platform | Vercel API token for Terraform-managed project shell. |
| `SUPABASE_ACCESS_TOKEN` | Platform | Supabase access token for Terraform-managed project shells and organization lookup. |

### Optional repository variables

| Variable | Default / behavior |
| --- | --- |
| `GCP_PROJECT_ID` | Derived from credential JSON `project_id`. |
| `PROJECT_SLUG` | Derived from repository name. |
| `TF_STATE_BUCKET_NAME` | Derived from GCP project id and project slug. |
| `TF_STATE_BUCKET_LOCATION` | `us-central1`. |
| `SUPABASE_ORGANIZATION_ID` | Auto-resolved only when the Supabase token can access exactly one organization. |
| `VERCEL_TEAM_ID` | Empty for personal Vercel accounts. |
| `VERCEL_PROJECT_NAME` | Project slug. |
| `VERCEL_ROOT_DIRECTORY` | Empty. |
| `SUPABASE_REGION` | `ap-southeast-1`. |
| `SUPABASE_INSTANCE_SIZE` | `micro`. |

The resolver script, `scripts/resolve-terraform-inputs.mjs`, converts these GitHub inputs into `TF_VAR_*` values and backend settings for Terraform.

## Terraform boundary

Terraform creates/imports the shared Vercel project and active Supabase projects. GitHub Environments remain the source of truth for runtime values used by the app, especially secrets. Runtime application secrets should not be duplicated in Terraform-managed Vercel env resources; CI syncs them from GitHub Environments.

Database schema belongs in Supabase migrations, not Terraform. Terraform owns provider project shells; migrations own app data structures and RLS.

## Bootstrap checklist

Use this as a short checklist. The expanded version is [`docs/bootstrap.md`](bootstrap.md).

1. Configure repository-level Terraform secrets.
2. Optionally configure repository-level Terraform variables when defaults are not enough.
3. Create GitHub Environments `development` and `production`; leave `staging` empty/reserved.
4. Run **Terraform State Bootstrap** with `apply=false`, review the plan, then rerun with `apply=true`.
5. Run **Terraform Platform** with `apply=false`, review the plan, then rerun with `apply=true`.
6. Copy Terraform output `vercel_project_id` into both active GitHub Environments as `VERCEL_PROJECT_ID`.
7. Copy each `supabase_project_refs[...]` output into the matching GitHub Environment as `SUPABASE_PROJECT_REF`.
8. Add `VERCEL_ORG_ID`, Supabase API URL/key values, Stripe values, and all required secrets listed in [`docs/environments.md`](environments.md).
9. Store each hosted Supabase database password as the matching environment's `SUPABASE_DB_PASSWORD`.
10. Create Google Cloud Web OAuth clients and add `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` to each active GitHub Environment.
11. Run **Configure Google OAuth** for `development` and `production`.
12. Configure dashboard-only provider settings such as Supabase Auth redirect URLs and Stripe webhook endpoints.
13. Run **Bootstrap Environment** for `development` and `production`.
14. Confirm `/api/health` and, for production, `/api/health?deep=1` after the regular deploy workflow runs.
15. Add production required reviewers before launch.

## Scaling path

When paid plans allow staging, add it by creating/importing a staging Supabase project, choosing a Vercel custom environment or separate staging Vercel project, recreating a staging deploy caller workflow, extending validation to allow `staging`, and filling the `staging` GitHub Environment values.