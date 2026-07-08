# Environments & configuration

GitHub Environments remain the source of truth for secrets and approval boundaries. CI/CD resolves deployment topology with `scripts/resolve-environment.mjs` from Terraform outputs, provider APIs, GitHub Environment values, and only then the optional `config/environments.json` local fallback.

## Active topology

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview | Development project | Active |
| `production` | Production | Production project | Active |
| `staging` | None | None | Reserved |

`staging` should stay empty until the repo has a third Supabase project and matching Vercel target.

## Resolution order

Hosted workflows resolve configuration in this order:

1. Values already present in the job environment, including GitHub Environment vars/secrets.
2. Terraform outputs from `infra/terraform/platform`.
3. Provider APIs, currently Supabase, Vercel, and Stripe lookups.
4. Non-empty values in `config/environments.json` as optional local fallback only.

Committed config never overrides Terraform, provider, or GitHub Environment values. Empty strings and `null` entries are ignored.

## Required repository secrets

| Name | Used by | Notes |
| --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Terraform State Bootstrap, Terraform Platform, output resolver | Google Cloud service account JSON for the Terraform state project. |
| `VERCEL_TOKEN` | Terraform Platform, resolver, Vercel env sync/deploy | Single Vercel token name for provisioning and deploy. Do not also create `VERCEL_API_TOKEN`. |
| `SUPABASE_ACCESS_TOKEN` | Terraform Platform, resolver, Supabase CLI, provider config | Supabase Management API and CLI access token. |

## Required environment variables

Add these to both active GitHub Environments unless noted.

| Name | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | App runtime, OAuth, Stripe webhook target | Required when the Vercel default URL is not the canonical environment URL. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe | Stripe does not expose this from the secret key, so keep it as an environment var. |
| `GOOGLE_OAUTH_CLIENT_ID` | Configure Providers, Bootstrap Environment | Required until Google OAuth client creation is automated. |

Optional environment vars:

| Name | Used by | Notes |
| --- | --- | --- |
| `APP_NAME` | App runtime, provider descriptions | Defaults to `Marketplace` from `config/environments.json`. |
| `STRIPE_WEBHOOK_ENDPOINT_ID` | Stripe provider reconcile | Optional if exactly one webhook endpoint matches `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`; set it to pin automation. |
| `STRIPE_WEBHOOK_ENABLED_EVENTS` | Stripe provider reconcile | Defaults to the app event set in `config/environments.json`. |

## Required environment secrets

Add these separately to `development` and `production`.

| Name | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Server runtime | Server-only Supabase key. Prefer `sb_secret_...` keys for new projects. |
| `STRIPE_SECRET_KEY` | Server Stripe, provider config | Test key in development, live key in production. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook route | Signing value for `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`; Stripe reveals this only when an endpoint is created. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Configure Providers, Bootstrap Environment | Google Cloud Web OAuth client secret. |

`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` are resolved by CI/CD and should not be manually copied from Terraform into GitHub Environments.

## Terraform output contract

`infra/terraform/platform` must output stable deployment dependencies:

| Output | Consumed as | Sensitive |
| --- | --- | --- |
| `vercel_project_id` | `VERCEL_PROJECT_ID` | No |
| `vercel_project_name` | Vercel metadata fallback | No |
| `vercel_team_id` | `VERCEL_ORG_ID` when team-owned | No |
| `supabase_project_refs` | `SUPABASE_PROJECT_REF` by environment | No |
| `supabase_project_urls` | `NEXT_PUBLIC_SUPABASE_URL` by environment | No |
| `supabase_database_passwords` | `SUPABASE_DB_PASSWORD` by environment | Yes |
| `active_supabase_environments` | Validation/documentation | No |
| `project_slug` | Resolver fallback | No |

Sensitive outputs are exported only to the job environment that needs them and are not emitted as GitHub job outputs.

## Provider-resolved values

`scripts/resolve-environment.mjs` resolves these values without committed config:

- Supabase publishable key via the Supabase Management API `GET /v1/projects/{ref}/api-keys`.
- Vercel scope/project metadata via the Vercel API.
- Stripe webhook endpoint id by listing endpoints and matching the target webhook URL when there is exactly one match.

Provider secrets remain in GitHub Environments or provider systems; they are not committed or printed.

## Optional local fallback

`config/environments.json` is kept for stable app defaults and local convenience only:

- `APP_NAME`
- `STRIPE_WEBHOOK_ENABLED_EVENTS`
- any temporary local-only non-secret value an operator explicitly chooses to add

Do not paste Terraform outputs, provider IDs, Supabase URLs, Supabase publishable keys, Vercel IDs, Google OAuth client IDs, or Stripe webhook endpoint IDs into this file for hosted CI/CD.

## Optional entries

| Scope | Name | Used by | Notes |
| --- | --- | --- | --- |
| Repository variable | `GCP_PROJECT_ID` | Terraform resolver | Derived from the Google credential JSON when omitted. |
| Repository variable | `PROJECT_SLUG` | Terraform resolver | Derived from repo name; normally `marketplace`. |
| Repository variable | `TF_STATE_BUCKET_NAME` | Terraform resolver | Derived from GCP project id + project slug. |
| Repository variable | `TF_STATE_BUCKET_LOCATION` | Terraform resolver | Defaults to `us-central1`. |
| Repository variable | `SUPABASE_ORGANIZATION_ID` | Terraform resolver | Required only when the Supabase token can access zero or multiple organizations. |
| Repository variable | `VERCEL_TEAM_ID` | Terraform Platform/resolver | Empty for personal Hobby accounts. Set only when Terraform should create/manage the Vercel project under a team. |
| Repository variable | `VERCEL_PROJECT_NAME` | Terraform Platform | Defaults to project slug. |
| Repository variable | `VERCEL_ROOT_DIRECTORY` | Terraform Platform | Empty while the app lives at repo root. |
| Repository variable | `SUPABASE_REGION` | Terraform Platform | Defaults to `ap-southeast-1`. |
| Repository variable | `SUPABASE_INSTANCE_SIZE` | Terraform Platform | Defaults to `micro`. |
| Environment secret | `RESEND_API_KEY` | Email notifications | Set only after Resend is configured. |
| Environment secret | `TWILIO_AUTH_TOKEN` | SMS notifications | Twilio auth token. |
| Environment secret | `TELEGRAM_BOT_TOKEN` | Telegram alerts | Telegram Bot API token. |
| Environment secret | `WHATSAPP_ACCESS_TOKEN` | WhatsApp alerts | WhatsApp Cloud API token. |

Optional public notification values such as `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL`, `TWILIO_ACCOUNT_SID`, and `WHATSAPP_PHONE_NUMBER_ID` may be environment variables or local fallback values.

## Local-only env

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<Google web client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google web client secret>
```

## Config flow

1. Terraform workflows create/reconcile the GCS state bucket, Vercel project, and Supabase project shells.
2. Workflows read `terraform output -json` and pass the result to `scripts/resolve-environment.mjs`.
3. The resolver fills public and deploy-only values from Terraform, Supabase, Vercel, Stripe, GitHub Environment vars, and optional local fallback.
4. **Configure Providers** applies hosted Supabase Google provider settings and updates/verifies Stripe webhook configuration.
5. **Bootstrap Environment** validates the resolved contract, generates `.env.deploy`, syncs Vercel env, links Supabase, pushes migrations, and removes generated files.
6. Normal deploys repeat validation, Vercel env sync, migration push, Vercel deploy, and smoke tests.

The machine-readable deploy contract is `ENV_CONTRACT` in `scripts/generate-env.mjs`. Keep it aligned with `lib/env.ts`, `.env.example`, workflow `env:` blocks, and this document.
