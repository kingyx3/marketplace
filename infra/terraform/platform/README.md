# Platform Terraform

This stack manages the provider project shells for the current hosted topology:

- one Vercel project named `marketplace`
- one Supabase project for `development`
- one Supabase project for `production`

`staging` is intentionally absent while the app uses the free-tier setup. Add
staging later by adding a third Supabase environment and choosing either a Vercel
custom environment or a separate staging Vercel project.

## State

Use HCP Terraform for remote state. Each HCP Terraform workspace stores its own
state and state history, so the state file is not committed to this repository.

1. Create an HCP Terraform organization and a workspace named
   `marketplace-platform`.
2. Copy `state.tf.example` to `state.tf` and set your organization name.
3. Do not commit `state.tf` if it contains account-specific configuration.
4. Run Terraform from this directory.

## Credentials

Set provider credentials outside git:

- `VERCEL_API_TOKEN` for the Vercel provider.
- `SUPABASE_ACCESS_TOKEN` for the Supabase provider.
- `supabase_db_secret_by_environment` as a sensitive HCP Terraform variable.

Do not put runtime app env values in Terraform. Runtime env belongs in GitHub
Environments and is synced to Vercel by the bootstrap/deploy workflows.

## First-time use

```bash
cd infra/terraform/platform
cp state.tf.example state.tf
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
