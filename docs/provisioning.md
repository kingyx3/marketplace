# Provisioning and infrastructure as code

## Scope

Terraform manages provider project shells; GitHub Environments manage runtime/deploy config; Supabase migrations manage database schema.

| Layer | Owner |
| --- | --- |
| GCS Terraform state bucket | `infra/terraform/bootstrap` via **Terraform State Bootstrap** |
| Shared Vercel project | `infra/terraform/platform` via **Terraform Platform** |
| Active Supabase project shells | `infra/terraform/platform` via **Terraform Platform** |
| Runtime/deploy secrets and vars | GitHub repository settings + GitHub Environments; see [`docs/environments.md`](environments.md) |
| Vercel runtime env | Synced from GitHub by `scripts/sync-vercel-env.mjs` |
| Database schema, storage, grants, RLS, RPCs | `supabase/migrations` + `supabase/seed.sql` |

## Hosted model

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview | Development project | Active |
| `production` | Production | Production project | Active |
| `staging` | None | None | Reserved |

## Terraform state

The state bucket is created by **Terraform State Bootstrap**. Defaults are derived by `scripts/resolve-terraform-inputs.mjs`; override them with optional repository variables from [`docs/environments.md`](environments.md#optional-github-secrets-and-variables) only when needed.

Bucket settings encoded in Terraform:

- Standard storage
- Uniform bucket-level access
- Public access prevention
- Object versioning

The platform stack has an empty committed `backend "gcs" {}` block. **Terraform Platform** passes the real bucket and prefix at `terraform init` time.

Terraform-generated Supabase database passwords are stored in remote state. Keep the GCS bucket locked down, and copy/reset each password into the matching GitHub Environment as `SUPABASE_DB_PASSWORD` for `supabase link`.

## Dashboard-managed items

These remain outside Terraform:

- GitHub repository secrets/vars and GitHub Environment secrets/vars.
- GitHub Environment protection rules, especially production required reviewers.
- Google Cloud OAuth clients and consent screen settings.
- Hosted Supabase redirect allow-list entries when the dashboard is required.
- Stripe webhook endpoints and account/payment-method settings.
- Optional notification provider sender/domain verification.

## Bootstrap checklist

Use [`docs/bootstrap.md`](bootstrap.md) for the full sequence. In short:

1. Add required GitHub entries from [`docs/environments.md`](environments.md#required-github-secrets-and-variables).
2. Run **Terraform State Bootstrap**: plan, then apply.
3. Run **Terraform Platform**: plan, then apply.
4. Copy Terraform outputs into GitHub Environments.
5. Finish Supabase, Google OAuth, Stripe, and Vercel dashboard settings.
6. Run **Configure Google OAuth** for both active environments.
7. Run **Bootstrap Environment** for both active environments.
8. Deploy and verify `/api/health`; production also verifies `/api/health?deep=1`.

## Scaling path

When paid plans justify staging, add a third Supabase project, choose a Vercel custom environment or separate staging project, add a staging deploy caller, extend validation to allow `staging`, and fill the `staging` GitHub Environment values.