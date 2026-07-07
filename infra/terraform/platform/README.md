# Platform Terraform

This stack manages the provider project shells for the current hosted topology:

- one Vercel project named `marketplace`
- one Supabase project for `development`
- one Supabase project for `production`

`staging` is intentionally absent while the app uses the free-tier setup. Add
staging later by adding a third Supabase environment and choosing either a Vercel
custom environment or a separate staging Vercel project.

## State

This stack uses the committed empty `backend "gcs" {}` block in `backend.tf`.
The bucket and prefix are passed by CI/CD during `terraform init`, so no real
backend config is committed.

Run **Terraform State Bootstrap** first to create/reconcile the GCS bucket, then
run **Terraform Platform**. For local runs, use `backend.config.example` as a
backend config template.

## CI/CD inputs

Repository variables:

- `GCP_PROJECT_ID`
- `TF_STATE_BUCKET_NAME`
- `TF_STATE_BUCKET_LOCATION` (optional; defaults to `us-central1` in CI)
- `VERCEL_PROJECT_NAME` (optional; defaults to `marketplace` in CI)
- `VERCEL_TEAM_ID` (optional)
- `VERCEL_ROOT_DIRECTORY` (optional)
- `SUPABASE_ORGANIZATION_ID`
- `SUPABASE_DEVELOPMENT_PROJECT_NAME`
- `SUPABASE_PRODUCTION_PROJECT_NAME`
- `SUPABASE_REGION` (optional; defaults to `ap-southeast-1` in CI)
- `SUPABASE_INSTANCE_SIZE` (optional; defaults to `micro` in CI)

Repository secrets:

- `GCP_TERRAFORM_CREDENTIALS_JSON`
- `VERCEL_API_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DEVELOPMENT_DB_PASSWORD`
- `SUPABASE_PRODUCTION_DB_PASSWORD`

The workflows pass these as `TF_VAR_*` values and backend config. Do not commit a
real `terraform.tfvars` file.

## Local use

Prefer the GitHub Actions workflows. For a local plan:

```bash
cd infra/terraform/platform
terraform init -backend-config=backend.config.example
terraform plan
```

Set provider credentials and `TF_VAR_*` values in your shell first.

After apply, copy outputs into GitHub Environments:

- `vercel_project_id` → both `development` and `production` GitHub Environments
  as `VERCEL_PROJECT_ID`
- `supabase_project_refs[development]` → `development` GitHub Environment
  `SUPABASE_PROJECT_REF`
- `supabase_project_refs[production]` → `production` GitHub Environment
  `SUPABASE_PROJECT_REF`

The remaining GitHub Environment values are listed in `docs/environments.md`.
Then run **Bootstrap Environment** for `development` and `production`.
