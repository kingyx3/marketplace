# End-to-end bootstrap guide

This is the operator runbook for taking the repository from a blank provider setup to working hosted `development` and `production` deployments. It documents both work that happens **outside the repo** in provider dashboards and work that happens **inside the repo** through scripts, Terraform, and GitHub Actions.

## Topology encoded in the repo

The code currently supports two active hosted GitHub Environments:

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to any non-`main` branch, excluding docs-only changes | Vercel Preview | One hosted development project | Active |
| `production` | `v*` tag push or published release | Vercel Production | One hosted production project | Active |
| `staging` | None | None | None | Reserved |

Do not configure `staging` yet. Add it only after the repo also has a third Supabase project and either a Vercel custom environment or a separate staging Vercel project.

## What gets created where

| Layer | Managed by | Notes |
| --- | --- | --- |
| GCS Terraform state bucket | `infra/terraform/bootstrap` through **Terraform State Bootstrap** | Bucket name is derived unless `TF_STATE_BUCKET_NAME` is set. |
| Vercel project shell | `infra/terraform/platform` through **Terraform Platform** | One shared project for Preview + Production. |
| Supabase project shells | `infra/terraform/platform` through **Terraform Platform** | One project per active data environment. |
| Supabase schema, seed, storage bucket, grants, RLS | SQL migrations + `supabase db push` | Migrations are forward-only. |
| Runtime env in Vercel | `scripts/sync-vercel-env.mjs` during bootstrap/deploy | GitHub Environments stay the source of truth. |
| App deploys | `.github/workflows/deploy*.yml` | Development deploys from feature branches; production deploys from tags/releases. |
| Google OAuth provider in hosted Supabase | **Configure Google OAuth** workflow | Google Cloud OAuth client must be created outside the repo. |

## 0. Local prerequisites

On your workstation:

```bash
git clone git@github.com:kingyx3/marketplace.git
cd marketplace
nvm use
npm ci
cp .env.example .env
```

For local Supabase you also need Docker and the Supabase CLI:

```bash
npx supabase start
npx supabase db reset
npm run dev
```

Use local `.env` only for local development. Deployed environments read GitHub Environment variables/secrets, generate a temporary `.env.deploy`, sync that to Vercel, then remove the generated file.

## 1. Create provider accounts and tokens outside the repo

Create or confirm access to these provider accounts before running workflows:

1. **GitHub**: admin access to `kingyx3/marketplace` and permission to edit repository secrets, repository variables, GitHub Environments, and environment protection rules.
2. **Google Cloud**: a project for the Terraform state bucket. Create a service account JSON credential that can create/read/update the GCS state bucket. Store the JSON as a GitHub repository secret in the next step.
3. **Vercel**: an API token for Terraform project creation and Vercel CLI deploy/env sync. The repo uses repository secret `VERCEL_API_TOKEN` for Terraform and environment secret `VERCEL_TOKEN` for runtime env sync/deploy. They can hold the same Vercel token.
4. **Supabase**: an access token for Terraform project creation, hosted Auth configuration, and CLI migration pushes. The repo uses repository secret `SUPABASE_ACCESS_TOKEN` for Terraform and environment secret `SUPABASE_ACCESS_TOKEN` for bootstrap/deploy. They can hold the same Supabase token.
5. **Stripe**: test and live publishable keys, secret keys, and webhook signing secrets.
6. **Google OAuth**: one Web application OAuth client per hosted environment, or one client whose authorized origins/redirect URIs cover both environments. The repo can apply the client id/secret to Supabase, but it cannot create the Google Cloud OAuth client for you.
7. **Optional notification providers**: Resend, Telegram Bot API, Twilio, and WhatsApp Cloud API credentials only when those channels should be active.

## 2. Configure repository-level GitHub Actions secrets and variables

Go to **Settings → Secrets and variables → Actions** for the repository.

### Repository secrets

These are read by the Terraform workflows:

| Secret | Required | Source |
| --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Yes | Google Cloud service account JSON for the state bucket project. |
| `VERCEL_API_TOKEN` | Yes for platform apply | Vercel API token. |
| `SUPABASE_ACCESS_TOKEN` | Yes for platform apply | Supabase access token. |

### Repository variables

All of these are optional unless your provider account requires disambiguation. Defaults come from `scripts/resolve-terraform-inputs.mjs`, Terraform variables, or workflow inputs.

| Variable | Default / when to set |
| --- | --- |
| `GCP_PROJECT_ID` | Derived from `GCP_TERRAFORM_CREDENTIALS_JSON.project_id`. Set when the JSON does not include `project_id` or you want to be explicit. |
| `PROJECT_SLUG` | Derived from the repo name, usually `marketplace`. Used in state bucket names and provider resource names. |
| `TF_STATE_BUCKET_NAME` | Derived as `<gcp-project-id>-<project-slug>-tfstate`. Set only if you need a different globally unique GCS bucket name. |
| `TF_STATE_BUCKET_LOCATION` | `us-central1`. |
| `SUPABASE_ORGANIZATION_ID` | Auto-resolved only when the Supabase token can see exactly one organization. Set when it can see zero or multiple organizations. |
| `VERCEL_TEAM_ID` | Empty for a personal Vercel account. Set for a Vercel team. |
| `VERCEL_PROJECT_NAME` | Defaults to `PROJECT_SLUG`. |
| `VERCEL_ROOT_DIRECTORY` | Empty for this repo root. Set only if the app moves into a subdirectory. |
| `SUPABASE_REGION` | `ap-southeast-1`. |
| `SUPABASE_INSTANCE_SIZE` | `micro`. |

## 3. Create GitHub Environments

Go to **Settings → Environments** and create:

- `development`
- `production`

Leave `staging` absent or empty.

For `production`, add required reviewers before live launch. The production deploy workflow targets the `production` GitHub Environment, so required reviewers pause production jobs for human approval before mutable work runs.

## 4. Run Terraform State Bootstrap

In GitHub Actions, run **Terraform State Bootstrap**.

1. First run with `apply=false` to validate, format-check, and plan.
2. Review the logs. The workflow derives CI/CD variables with `scripts/resolve-terraform-inputs.mjs state` and imports the bucket if it already exists.
3. Run again with `apply=true` to create or reconcile the GCS state bucket.

The state bucket is private, has uniform bucket-level access, enforces public access prevention, and has object versioning enabled.

## 5. Run Terraform Platform

In GitHub Actions, run **Terraform Platform**.

1. First run with `apply=false` to initialize the GCS backend, format-check, validate, and plan.
2. Review the Vercel project and Supabase project changes.
3. Run again with `apply=true`.
4. Capture Terraform outputs:
   - `vercel_project_id`
   - `supabase_project_refs["development"]`
   - `supabase_project_refs["production"]`
   - `active_supabase_environments`

Terraform generates Supabase database passwords and stores them in the remote Terraform state. The deploy workflows still require each environment's database password as `SUPABASE_DB_PASSWORD` so `supabase link` can run. Retrieve the generated password from the locked-down Terraform state, or reset the database password in the matching Supabase project and store that value as the environment secret. Keep the GCS state bucket private because it contains sensitive generated credentials.

## 6. Fill GitHub Environment variables and secrets

Repeat this section for both `development` and `production`.

### Required environment variables

| Variable | Source / value |
| --- | --- |
| `APP_NAME` | Display name, for example `Marketplace`. |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL for that hosted environment. For development, use a stable preview/branch URL if you have one; otherwise update this after the first preview deployment and rerun bootstrap/deploy. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL for that environment: `https://<project-ref>.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable browser key for that project. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for the environment (`pk_test_...` for development, `pk_live_...` for production). |
| `SUPABASE_PROJECT_REF` | Matching Terraform output from `supabase_project_refs[...]`. |
| `VERCEL_ORG_ID` | Vercel account/team id used by the CLI. |
| `VERCEL_PROJECT_ID` | Terraform output `vercel_project_id`; same value in both active environments. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Web OAuth client id for hosted Supabase Auth. Required before running **Configure Google OAuth**. |

### Required environment secrets

| Secret | Source / value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase access token. Can match the repository secret of the same name. |
| `SUPABASE_DB_PASSWORD` | Database password for this Supabase project. Required for `supabase link`. |
| `SUPABASE_SECRET_KEY` | Supabase server-side secret key for the project. Never expose to the browser. |
| `STRIPE_SECRET_KEY` | Stripe secret key for the environment (`sk_test_...` or `sk_live_...`). |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for `/api/webhooks/stripe`. |
| `VERCEL_TOKEN` | Vercel token used by the Vercel CLI. Can match `VERCEL_API_TOKEN`. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Web OAuth client secret. Required before running **Configure Google OAuth**. |

### Optional environment variables and secrets

Unset optional channels are treated as disabled. The Vercel sync removes unset optional runtime keys from the selected Vercel target so stale provider config does not linger.

| Key | Type | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret | Email provider. |
| `RESEND_FROM_EMAIL` | Variable | Verified sender address. |
| `SUPPORT_EMAIL` | Variable | Support contact shown in transactional email. |
| `TWILIO_ACCOUNT_SID` | Variable | SMS account id. |
| `TWILIO_AUTH_TOKEN` | Secret | SMS auth token. |
| `TELEGRAM_BOT_TOKEN` | Secret | Telegram Bot API. |
| `WHATSAPP_ACCESS_TOKEN` | Secret | WhatsApp Cloud API. |
| `WHATSAPP_PHONE_NUMBER_ID` | Variable | WhatsApp sender phone-number id. |

## 7. Finish provider dashboard configuration

### Supabase

For each hosted project:

1. Copy the project API URL, publishable key, and server-side secret key into the matching GitHub Environment.
2. Add Auth redirect allow-list entries for the environment:
   - `${NEXT_PUBLIC_SITE_URL}/auth/callback`
   - `${NEXT_PUBLIC_SITE_URL}/auth/callback**`
   - Local development entries when needed: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback**`
3. Confirm the database password stored as `SUPABASE_DB_PASSWORD` matches the hosted project.
4. Do not hand-edit schema tables for normal changes. Schema, storage bucket, grants, and RLS policies come from migrations.

### Google OAuth

Inside the repo, print the exact plan for the current local env:

```bash
npm run oauth:google:plan
```

In Google Cloud, create or update a **Web application** OAuth client with:

- Authorized JavaScript origins:
  - the origin from `NEXT_PUBLIC_SITE_URL`
  - `http://localhost:3000` for local development
- Authorized redirect URIs:
  - `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`
  - `http://127.0.0.1:54321/auth/v1/callback` for local development

Then run **Configure Google OAuth** in GitHub Actions for `development` and `production`. The workflow prints the URL plan, applies `external_google_enabled`, `external_google_client_id`, and `external_google_secret` through the Supabase Management API, then verifies `/auth/v1/settings` reports Google as enabled.

For local Supabase, put these in `.env`:

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<Google web client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google web client secret>
```

The old local aliases `SUPABASE_AUTH_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_GOOGLE_CLIENT_SECRET` are tolerated by parts of the app runtime but should not be used for new local setup.

### Stripe

For each environment:

1. Create or select the correct Stripe account mode: test for `development`, live for `production`.
2. Add the publishable key as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Add the secret key as `STRIPE_SECRET_KEY`.
4. Create a webhook endpoint pointing to `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
5. Subscribe to the event types the code handles:
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
6. Add the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

### Vercel

1. Confirm the Terraform-created project exists.
2. Confirm `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are set in both active GitHub Environments.
3. Do not manually maintain runtime env in Vercel. Bootstrap/deploy syncs runtime env from GitHub Environments to Vercel Preview or Production.

## 8. Run Bootstrap Environment

Run **Bootstrap Environment** in GitHub Actions once per active environment:

1. Choose `development`.
2. The workflow validates the GitHub Environment contract.
3. It generates `.env.deploy` from environment values.
4. It syncs runtime env to Vercel Preview.
5. It links the Supabase project with `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`.
6. It applies Supabase migrations.
7. It removes `.env.deploy`.
8. Repeat for `production` after production secrets, OAuth, Stripe, and environment protection are ready.

Bootstrap does **not** deploy the app. It prepares downstream provider state.

## 9. Deploy

Development deploys automatically on pushes to non-`main` branches unless the change is docs-only.

Production deploys when you push a `v*` tag or publish a GitHub release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Production deploys should pause at the GitHub Environment approval gate before jobs targeting `production` run.

## 10. Verify

After bootstrap and deploy:

```bash
npm run env:check
npm run config:check
npm run lint
npm run typecheck
npm test
npm run build
```

For hosted deployments:

1. Open `${deployment_url}/api/health`; it should return HTTP 200.
2. For production, open `${deployment_url}/api/health?deep=1`; it should check Supabase, Stripe config, and notification readiness.
3. Sign in with Google and confirm `/auth/callback` returns to the site.
4. Confirm catalog pages read live Supabase rows or the documented fallback fixtures.
5. Run a Stripe test-mode order in development before enabling live production sales.

## 11. Safe update rules after bootstrap

- Change runtime configuration in GitHub Environments, then rerun **Bootstrap Environment** or the normal deploy so Vercel is reconciled.
- Do not treat Vercel dashboard env as canonical.
- Add schema changes as new migration files. Never edit an applied migration.
- Keep production protected with required reviewers.
- Keep repository-level Terraform credentials separate from environment-level runtime/deploy credentials, even when values intentionally duplicate.