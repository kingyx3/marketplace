# Provisioning and infrastructure as code

## Scope

Terraform manages provider project shells; provider bootstrap scripts manage safe SaaS configuration; GitHub Environments manage runtime/deploy config; Supabase migrations manage database schema.

| Layer | Owner |
| --- | --- |
| GCS Terraform state bucket | `infra/terraform/bootstrap` via **Terraform State Bootstrap** |
| Shared Vercel project | `infra/terraform/platform` via **Terraform Platform** |
| Active Supabase project shells | `infra/terraform/platform` via **Terraform Platform** |
| Hosted Supabase Google Auth provider | `scripts/configure-google-oauth.mjs` orchestrated by `scripts/configure-providers.mjs` |
| Stripe webhook endpoint | `scripts/configure-stripe.mjs` orchestrated by `scripts/configure-providers.mjs` |
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

## Vercel scope model

The current default is a Vercel Hobby/personal project:

- Leave repository-level `VERCEL_TEAM_ID` empty so Terraform creates/manages the Vercel project under the personal account attached to `VERCEL_API_TOKEN`.
- Store the personal Vercel user id as environment-level `VERCEL_ORG_ID` in both active GitHub Environments. The name is kept because the Vercel CLI expects that project-linking variable.
- Keep `VERCEL_PROJECT_ID` as the Terraform output for the project.

When moving to a team/org later, set repository-level `VERCEL_TEAM_ID`, reconcile Terraform for the team-owned project, replace environment-level `VERCEL_ORG_ID` with the team/org id, and update `VERCEL_PROJECT_ID` if Vercel creates a new project id.

## Provider bootstrap scripts

Provider scripts are intentionally outside Terraform when secrets, one-time values, or dashboard-owned account state make Terraform state a poor fit.

- `scripts/configure-providers.mjs` is the single entry point for provider plan/apply/verify flows.
- `scripts/configure-google-oauth.mjs` applies and verifies the hosted Supabase Google provider after the Google Cloud OAuth client exists.
- `scripts/configure-stripe.mjs` idempotently creates/updates the Stripe webhook endpoint and refuses to log webhook signing secrets by default.
- **Configure Providers** runs the orchestrator explicitly with `plan`, `apply`, or `verify`.
- **Bootstrap Environment** reruns the orchestrator with `--apply-if-configured` before validating and syncing runtime env.

## Dashboard-managed items

These remain outside Terraform/provider automation:

- GitHub repository secrets/vars and GitHub Environment secrets/vars.
- GitHub Environment protection rules, especially production required reviewers.
- Google Cloud OAuth clients and consent screen settings.
- Hosted Supabase redirect allow-list entries when the dashboard is required.
- Stripe account-level settings, payment-method settings, branding, tax/compliance settings, and dashboard-only review flows.
- Optional notification provider sender/domain verification.

## Bootstrap checklist

Use [`docs/bootstrap.md`](bootstrap.md) for the full sequence. In short:

1. Add required GitHub entries from [`docs/environments.md`](environments.md#required-github-secrets-and-variables).
2. Run **Terraform State Bootstrap**: plan, then apply.
3. Run **Terraform Platform**: plan, then apply.
4. Copy Terraform outputs into GitHub Environments.
5. Finish provider dashboard prerequisites for Supabase, Google Cloud OAuth, Stripe account settings, and Vercel.
6. Run **Configure Providers**: plan, then apply for both active environments.
7. Run **Bootstrap Environment** for both active environments.
8. Deploy and verify `/api/health`; production also verifies `/api/health?deep=1`.

## Scaling path

When paid plans justify staging, add a third Supabase project, choose a Vercel custom environment or separate staging project, add a staging deploy caller, extend validation to allow `staging`, and fill the `staging` GitHub Environment values.
