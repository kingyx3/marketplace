# Platform Terraform

This stack manages the provider project shells for the current hosted topology:

- one Vercel project named `marketplace`
- one Supabase project for `development`
- one Supabase project for `production`

`staging` is intentionally absent while the app uses the free-tier setup. Add
staging later by adding a third Supabase environment and choosing either a Vercel
custom environment or a separate staging Vercel project.

## State

Use Google Cloud Storage for remote Terraform state. The GCS bucket must already
exist before `terraform init`. Enable object versioning on the bucket so state can
be recovered after accidental deletion or operator error.

Recommended bucket settings:

- Location: `us-central1`, `us-east1`, or `us-west1`
- Storage class: Standard
- Public access prevention: enforced
- Uniform bucket-level access: enabled
- Object versioning: enabled

Create the bucket once, then copy `state.tf.example` to `backend.tf` and set the
bucket name. Do not commit `backend.tf`.

## Credentials

Set provider credentials outside git:

- Google Application Default Credentials for the Terraform GCS backend.
- `VERCEL_API_TOKEN` for the Vercel provider.
- `SUPABASE_ACCESS_TOKEN` for the Supabase provider.
- `supabase_db_secret_by_environment` as a sensitive local or CI variable.

Do not put runtime app env values in Terraform. Runtime env belongs in GitHub
Environments and is synced to Vercel by the bootstrap/deploy workflows.

## First-time use

```bash
cd infra/terraform/platform
cp state.tf.example backend.tf
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Use `terraform.tfvars.example` as a template, but do not commit a real
`terraform.tfvars` file.

After apply, copy outputs into GitHub Environments:

- `vercel_project_id` → both `development` and `production` GitHub Environments
  as `VERCEL_PROJECT_ID`
- `supabase_project_refs[development]` → `development` GitHub Environment
  `SUPABASE_PROJECT_REF`
- `supabase_project_refs[production]` → `production` GitHub Environment
  `SUPABASE_PROJECT_REF`

The remaining GitHub Environment values are listed in `docs/environments.md`.
Then run **Bootstrap Environment** for `development` and `production`.
