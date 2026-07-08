# Provisioning and infrastructure as code

## Scope

Terraform manages provider project shells; provider bootstrap scripts manage safe SaaS configuration; GitHub Environments manage secrets and unavoidable manual public values; Supabase migrations manage database schema.

| Layer | Owner |
| --- | --- |
| GCS Terraform state bucket | `infra/terraform/bootstrap` via **Terraform State Bootstrap** |
| Shared Vercel project | `infra/terraform/platform` via **Terraform Platform** |
| Active Supabase project shells | `infra/terraform/platform` via **Terraform Platform** |
| Deployment topology | Terraform outputs resolved by `scripts/resolve-environment.mjs` |
| Optional local defaults | `config/environments.json` |
| Hosted Supabase Google Auth provider | `scripts/configure-google-oauth.mjs` orchestrated by `scripts/configure-providers.mjs` |
| Stripe webhook endpoint | `scripts/configure-stripe.mjs` orchestrated by `scripts/configure-providers.mjs` |
| Environment bootstrap | `scripts/bootstrap-environment.mjs` through **Bootstrap Environment** |
| Runtime/deploy secrets | GitHub repository secrets + GitHub Environments; see `docs/environments.md` |
| Vercel runtime env | Synced from the resolved environment by `scripts/sync-vercel-env.mjs` |
| Database schema, storage, grants, RLS, RPCs | `supabase/migrations` + `supabase/seed.sql` |

## Hosted model

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview | Development project | Active |
| `production` | Production | Production project | Active |
| `staging` | None | None | Reserved |

## Terraform state

The state bucket is created by **Terraform State Bootstrap**. Defaults are derived by `scripts/resolve-terraform-inputs.mjs`; override them with optional repository variables from `docs/environments.md` only when needed.

Bucket settings encoded in Terraform:

- Standard storage
- Uniform bucket-level access
- Public access prevention
- Object versioning

The platform stack has an empty committed `backend "gcs" {}` block. Workflows pass the real bucket and prefix at `terraform init` time.

## Terraform output contract

The platform stack exposes all stable downstream deployment dependencies:

- `vercel_project_id`
- `vercel_project_name`
- `vercel_team_id`
- `supabase_project_refs`
- `supabase_project_urls`
- `supabase_database_passwords` (sensitive)
- `active_supabase_environments`
- `project_slug`

Workflows run `terraform output -json` and pass the file to `scripts/resolve-environment.mjs`. The sensitive database password is exported only to the job environment that links Supabase and pushes migrations.

## Optional local config

Use `config/environments.json` only for stable defaults and local fallback:

- `APP_NAME`
- `STRIPE_WEBHOOK_ENABLED_EVENTS`

Hosted CI/CD must not depend on manually copied Terraform outputs, provider IDs, public Supabase values, Vercel IDs, Google OAuth client IDs, or Stripe webhook endpoint IDs in committed config.

## Vercel scope model

The current default is a Vercel Hobby/personal project:

- Leave repository-level `VERCEL_TEAM_ID` empty so Terraform creates/manages the Vercel project under the personal account attached to `VERCEL_TOKEN`.
- CI resolves the personal `VERCEL_ORG_ID` from the Vercel API when possible.
- If you later move to a team/org, set repository-level `VERCEL_TEAM_ID` before reconciling Terraform for the team-owned project.

## Provider bootstrap scripts

Provider scripts are intentionally outside Terraform when secrets, one-time values, or dashboard-owned account state make Terraform state a poor fit.

- `scripts/resolve-environment.mjs` resolves Terraform outputs, provider API values, GitHub Environment values, and optional local fallback into the job environment.
- `scripts/environment-config.mjs` reads optional local fallback config and never overrides existing env values by default.
- `scripts/generate-env.mjs` validates the resolved contract and writes `.env.deploy` for Vercel runtime sync.
- `scripts/configure-providers.mjs` is the single entry point for provider plan/apply/verify flows.
- `scripts/configure-google-oauth.mjs` applies and verifies the hosted Supabase Google provider after the Google Cloud OAuth client exists.
- `scripts/configure-stripe.mjs` idempotently updates/verifies the Stripe webhook endpoint in CI and can create the first endpoint only from a trusted local shell with `--print-created-secret`.
- `scripts/bootstrap-environment.mjs` codifies provider config, resolved env validation, `.env.deploy` generation, Vercel env sync, Supabase link, and migration push.
- `scripts/deploy-vercel.mjs` keeps Vercel deploy invocation out of workflow shell snippets while preserving GitHub Environment approval and secret scoping.

GitHub Actions must not create the first Stripe webhook endpoint because Stripe returns the signing secret only once and this repo does not grant Actions permission to write GitHub Environment secrets. First endpoint creation is therefore an explicit local/dashboard bootstrap step; subsequent endpoint reconciliation is automated.

## Dashboard-managed items

These remain outside Terraform/provider automation:

- GitHub repository secrets and GitHub Environment secrets.
- GitHub Environment protection rules, especially production required reviewers.
- Google OAuth consent screen settings and Web client creation until automated.
- Stripe account-level settings, payment-method settings, branding, tax/compliance settings, and dashboard-only review flows.
- Optional notification provider sender/domain verification.

## Bootstrap checklist

Use `docs/bootstrap.md` for the full sequence. In short:

1. Add required GitHub repository secrets and environment vars/secrets from `docs/environments.md`.
2. Run **Terraform State Bootstrap**: plan, then apply.
3. Run **Terraform Platform**: plan, then apply.
4. Finish provider prerequisites for Supabase secret keys, Google OAuth, Stripe one-time webhook signing secrets, and optional notifications.
5. Run **Configure Providers**: plan, then apply for both active environments.
6. Run **Bootstrap Environment** for both active environments.
7. Deploy and verify `/api/health`; production also verifies `/api/health?deep=1`.

## Scaling path

When paid plans justify staging, add a third Supabase project, choose a Vercel custom environment or separate staging project, add a staging deploy caller, extend validation to allow `staging`, and fill the `staging` GitHub Environment values.
