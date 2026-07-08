# Environments & configuration

GitHub Environments are the source of truth for secrets and approval boundaries. Non-secret deployment topology should live in [`config/environments.json`](../config/environments.json) whenever it is stable enough to review in code. Vercel runtime values are reconciled from the resolved environment during bootstrap and deploy.

## Active topology

| GitHub Environment | Vercel target | Supabase project | Status |
| --- | --- | --- | --- |
| `development` | Preview | Development project | Active |
| `production` | Production | Production project | Active |
| `staging` | None | None | Reserved |

`staging` should stay empty until the repo has a third Supabase project and matching Vercel target.

## Resolution order

The deploy/bootstrap scripts resolve configuration in this order:

1. Values already present in the process environment, including GitHub secrets, GitHub vars, local shell exports, and `.env`.
2. Non-empty values in [`config/environments.json`](../config/environments.json): first `shared`, then the selected `development` or `production` block.
3. Empty strings and `null` entries in `config/environments.json` are ignored so existing GitHub vars can remain as migration fallback.

This means public values such as `NEXT_PUBLIC_SITE_URL`, `APP_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_REF`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `STRIPE_WEBHOOK_ENDPOINT_ID`, and `STRIPE_WEBHOOK_ENABLED_EVENTS` do not need to be GitHub vars after they are committed to `config/environments.json`.

Secrets must remain GitHub Environment secrets for now, or move later to an external secret manager accessed through CI identity/OIDC. Do not pass secrets through `workflow_dispatch` inputs or commit them to `config/environments.json`.

## Required repository secrets

| Name | Used by | Notes |
| --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Terraform State Bootstrap, Terraform Platform | Google Cloud service account JSON for the Terraform state project. |
| `VERCEL_API_TOKEN` | Terraform Platform | Vercel API token for project provisioning. |
| `SUPABASE_ACCESS_TOKEN` | Terraform Platform | Supabase access token for project provisioning and org lookup. |

## Required environment secrets

Add these separately to both `development` and `production`.

| Name | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Server runtime | Server-only Supabase key. |
| `SUPABASE_ACCESS_TOKEN` | Bootstrap/deploy, provider config | May match repository value. |
| `SUPABASE_DB_PASSWORD` | `supabase link` | Matching hosted database password. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe | Public value; may move to `config/environments.json` after known. |
| `STRIPE_SECRET_KEY` | Server Stripe, provider config | Test key in development, live key in production. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook route | Signing value for `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`; required before deploy. |
| `VERCEL_TOKEN` | Vercel env sync/deploy | Vercel deploy token. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Configure Providers, Bootstrap Environment | Google Cloud Web OAuth client secret. |

## Versioned public environment config

Fill non-secret values in [`config/environments.json`](../config/environments.json) once they are known.

| Name | Used by | Notes |
| --- | --- | --- |
| `APP_NAME` | App runtime, provider bootstrap | Shared display name, defaults to `Marketplace`. |
| `NEXT_PUBLIC_SITE_URL` | App runtime, OAuth, Stripe, readiness | Canonical URL for that environment. |
| `NEXT_PUBLIC_SUPABASE_URL` | App runtime, OAuth | `https://<project-ref>.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/runtime Supabase access, OAuth verification | RLS still controls access. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe | Test publishable key in development, live publishable key in production. |
| `SUPABASE_PROJECT_REF` | Bootstrap/deploy, provider config | Terraform output for the environment. |
| `VERCEL_ORG_ID` | Vercel CLI | Personal user id on Hobby; team/org id after moving the project to a team. |
| `VERCEL_PROJECT_ID` | Vercel CLI | Terraform output `vercel_project_id`; same value in both active environments. |
| `GOOGLE_OAUTH_CLIENT_ID` | Configure Providers, Bootstrap Environment | Google Cloud Web OAuth client id. |
| `STRIPE_WEBHOOK_ENDPOINT_ID` | Configure Providers, Bootstrap Environment | Recommended endpoint id to pin Stripe automation after the first webhook endpoint is created. |
| `STRIPE_WEBHOOK_ENABLED_EVENTS` | Configure Providers, Bootstrap Environment | Shared default lives in `config/environments.json`; override only when app webhook coverage changes. |

Do not store `TARGET_ENV`; workflows derive it from the selected environment.

## Optional entries

| Scope | Name | Used by | Notes |
| --- | --- | --- | --- |
| Repository | `GCP_PROJECT_ID` | Terraform resolver | Derived from the Google credential JSON when omitted. |
| Repository | `PROJECT_SLUG` | Terraform resolver | Derived from repo name; normally `marketplace`. |
| Repository | `TF_STATE_BUCKET_NAME` | Terraform resolver | Derived from GCP project id + project slug. |
| Repository | `TF_STATE_BUCKET_LOCATION` | Terraform resolver | Defaults to `us-central1`. |
| Repository | `SUPABASE_ORGANIZATION_ID` | Terraform resolver | Required only when the Supabase token can access zero or multiple organizations. |
| Repository | `VERCEL_TEAM_ID` | Terraform Platform | Empty for personal Hobby accounts. Set only when Terraform should create/manage the Vercel project under a team. |
| Repository | `VERCEL_PROJECT_NAME` | Terraform Platform | Defaults to project slug. |
| Repository | `VERCEL_ROOT_DIRECTORY` | Terraform Platform | Empty while the app lives at repo root. |
| Repository | `SUPABASE_REGION` | Terraform Platform | Defaults to `ap-southeast-1`. |
| Repository | `SUPABASE_INSTANCE_SIZE` | Terraform Platform | Defaults to `micro`. |
| Environment | `RESEND_API_KEY` | Email notifications | Set only after Resend is configured. |
| Environment | `RESEND_FROM_EMAIL` | Email notifications | Verified sender address; can move to `config/environments.json` if stable. |
| Environment | `SUPPORT_EMAIL` | Emails/support copy | Customer support contact; can move to `config/environments.json` if stable. |
| Environment | `TWILIO_ACCOUNT_SID` | SMS notifications | Twilio account id; can move to `config/environments.json` if stable. |
| Environment | `TWILIO_AUTH_TOKEN` | SMS notifications | Twilio auth token. |
| Environment | `TELEGRAM_BOT_TOKEN` | Telegram alerts | Telegram Bot API token. |
| Environment | `WHATSAPP_ACCESS_TOKEN` | WhatsApp alerts | WhatsApp Cloud API token. |
| Environment | `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp alerts | WhatsApp sender phone-number id; can move to `config/environments.json` if stable. |

## Vercel Hobby now, team/org later

Keep `VERCEL_ORG_ID` as the deploy-scope value because the Vercel CLI expects that name when paired with `VERCEL_PROJECT_ID`.

- While this is a Hobby project, use your personal Vercel user id.
- Keep repository-level `VERCEL_TEAM_ID` empty so Terraform provisions/manages the project under your personal account.
- If you later move to a team/org, set repository-level `VERCEL_TEAM_ID` before reconciling Terraform for the team-owned project, update `VERCEL_ORG_ID` in `config/environments.json`, and update `VERCEL_PROJECT_ID` if the project id changes.

## Local-only env

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<Google web client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google web client secret>
```

## Config flow

1. Terraform workflows create/reconcile the GCS state bucket, Vercel project, and Supabase project shells.
2. Terraform outputs and provider dashboard public values are committed to `config/environments.json`; secrets stay in GitHub Environments.
3. The first Stripe webhook endpoint is created explicitly from a trusted local shell with `npm run providers:apply -- --print-created-secret`, or in the Stripe dashboard, so the returned signing secret can be stored immediately.
4. **Configure Providers** applies hosted Supabase Google provider settings and safely updates/verifies Stripe webhook configuration.
5. **Bootstrap Environment** reruns provider config in `--apply-if-configured` mode, validates one resolved environment, generates `.env.deploy`, syncs runtime env to Vercel, links Supabase, and pushes migrations.
6. Normal deploys repeat validation, Vercel env sync, migration push, Vercel deploy, and smoke tests.

The machine-readable deploy contract is `ENV_CONTRACT` in [`scripts/generate-env.mjs`](../scripts/generate-env.mjs), merged with [`config/environments.json`](../config/environments.json) by [`scripts/environment-config.mjs`](../scripts/environment-config.mjs). Keep those aligned with [`lib/env.ts`](../lib/env.ts), [`.env.example`](../.env.example), workflow `env:` blocks, and this document.
