# Environments & configuration

GitHub is the source of truth for hosted config. Vercel env is reconciled from GitHub during bootstrap/deploy; do not maintain runtime env by hand in Vercel.

## Active topology

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to non-`main` branches, unless docs-only | Preview | Development project | Active |
| `production` | `v*` tag or published release | Production | Production project | Active |
| `staging` | None | None | None | Reserved |

`staging` should stay empty until the repo has a third Supabase project and matching Vercel target.

## Required GitHub secrets and variables

Configure repository-level entries under **Settings → Secrets and variables → Actions**. Configure environment-level entries separately in both `development` and `production` under **Settings → Environments**.

| Scope | Name | Kind | Used by | Source / value |
| --- | --- | --- | --- | --- |
| Repository | `GCP_TERRAFORM_CREDENTIALS_JSON` | Secret | Terraform State Bootstrap, Terraform Platform | Google Cloud service account JSON for the Terraform state project. |
| Repository | `VERCEL_API_TOKEN` | Secret | Terraform Platform | Vercel API token for project provisioning. |
| Repository | `SUPABASE_ACCESS_TOKEN` | Secret | Terraform Platform | Supabase access token for project provisioning and org lookup. |
| Environment | `APP_NAME` | Variable | App runtime, health, emails, provider bootstrap | Display name, for example `Marketplace`. |
| Environment | `NEXT_PUBLIC_SITE_URL` | Variable | App runtime, OAuth, Stripe, smoke/readiness | Canonical URL for that environment. |
| Environment | `NEXT_PUBLIC_SUPABASE_URL` | Variable | App runtime, OAuth | `https://<project-ref>.supabase.co`. |
| Environment | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variable | Browser/runtime Supabase access, OAuth verification | Project publishable key; RLS still controls access. |
| Environment | `SUPABASE_SECRET_KEY` | Secret | Server runtime | Server-only Supabase key. |
| Environment | `SUPABASE_ACCESS_TOKEN` | Secret | Bootstrap/deploy, provider config | Supabase access token; may match repository secret. |
| Environment | `SUPABASE_DB_PASSWORD` | Secret | `supabase link` | Matching hosted database password. Terraform-generated passwords are in remote state unless reset in Supabase. |
| Environment | `SUPABASE_PROJECT_REF` | Variable | Bootstrap/deploy, provider config | Terraform output `supabase_project_refs[environment]`. |
| Environment | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Variable | Browser Stripe | `pk_test_...` in development, `pk_live_...` in production. |
| Environment | `STRIPE_SECRET_KEY` | Secret | Server Stripe, provider config | `sk_test_...` in development, `sk_live_...` in production. |
| Environment | `STRIPE_WEBHOOK_SECRET` | Secret | Stripe webhook route | Signing secret for `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`. Required before deploy. |
| Environment | `VERCEL_TOKEN` | Secret | Vercel env sync/deploy | Vercel token; may match `VERCEL_API_TOKEN`. |
| Environment | `VERCEL_ORG_ID` | Variable | Vercel CLI | Vercel account/team id. |
| Environment | `VERCEL_PROJECT_ID` | Variable | Vercel CLI | Terraform output `vercel_project_id`; same value in both active environments. |
| Environment | `GOOGLE_OAUTH_CLIENT_ID` | Variable | Configure Providers, Bootstrap Environment | Google Cloud Web OAuth client id. |
| Environment | `GOOGLE_OAUTH_CLIENT_SECRET` | Secret | Configure Providers, Bootstrap Environment | Google Cloud Web OAuth client secret. |

Do not store `TARGET_ENV`; workflows derive it from the selected environment and only allow `development` or `production`.

## Optional GitHub secrets and variables

Unset optional notification keys disable that channel. During Vercel sync, unset optional runtime keys are removed from the matching Vercel target to avoid stale config.

| Scope | Name | Kind | Used by | Default / when to set |
| --- | --- | --- | --- | --- |
| Repository | `GCP_PROJECT_ID` | Variable | Terraform resolver | Derived from the Google credential JSON when omitted. |
| Repository | `PROJECT_SLUG` | Variable | Terraform resolver | Derived from repo name; normally `marketplace`. |
| Repository | `TF_STATE_BUCKET_NAME` | Variable | Terraform resolver | Derived from GCP project id + project slug. |
| Repository | `TF_STATE_BUCKET_LOCATION` | Variable | Terraform resolver | Defaults to `us-central1`. |
| Repository | `SUPABASE_ORGANIZATION_ID` | Variable | Terraform resolver | Required only when the Supabase token can access zero or multiple organizations. |
| Repository | `VERCEL_TEAM_ID` | Variable | Terraform Platform | Empty for personal Vercel accounts. |
| Repository | `VERCEL_PROJECT_NAME` | Variable | Terraform Platform | Defaults to project slug. |
| Repository | `VERCEL_ROOT_DIRECTORY` | Variable | Terraform Platform | Empty while the app lives at repo root. |
| Repository | `SUPABASE_REGION` | Variable | Terraform Platform | Defaults to `ap-southeast-1`. |
| Repository | `SUPABASE_INSTANCE_SIZE` | Variable | Terraform Platform | Defaults to `micro`. |
| Environment | `STRIPE_WEBHOOK_ENDPOINT_ID` | Variable | Configure Providers, Bootstrap Environment | Optional `we_...` id to pin automation to a specific Stripe endpoint after creation. |
| Environment | `STRIPE_WEBHOOK_ENABLED_EVENTS` | Variable | Configure Providers, Bootstrap Environment | Optional comma/space-separated override. Defaults to `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.refunded`. |
| Environment | `RESEND_API_KEY` | Secret | Email notifications | Set only after Resend is configured. |
| Environment | `RESEND_FROM_EMAIL` | Variable | Email notifications | Verified sender address. |
| Environment | `SUPPORT_EMAIL` | Variable | Emails/support copy | Customer support contact. |
| Environment | `TWILIO_ACCOUNT_SID` | Variable | SMS notifications | Twilio account id. |
| Environment | `TWILIO_AUTH_TOKEN` | Secret | SMS notifications | Twilio auth token. |
| Environment | `TELEGRAM_BOT_TOKEN` | Secret | Telegram alerts | Telegram Bot API token. |
| Environment | `WHATSAPP_ACCESS_TOKEN` | Secret | WhatsApp alerts | WhatsApp Cloud API token. |
| Environment | `WHATSAPP_PHONE_NUMBER_ID` | Variable | WhatsApp alerts | WhatsApp sender phone-number id. |

## Local-only env

Local development uses `.env`, copied from `.env.example`. These local Supabase Google OAuth keys are not GitHub Environment entries and are not synced to Vercel:

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<Google web client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google web client secret>
```

## Config flow

1. Terraform workflows use repository-level entries to create/reconcile the GCS state bucket, Vercel project, and Supabase project shells.
2. Terraform outputs and provider dashboard values are stored in the `development` and `production` GitHub Environments.
3. **Configure Providers** applies hosted Supabase Google provider settings after the Google Cloud OAuth client exists.
4. **Configure Providers** creates/updates the Stripe webhook endpoint; `STRIPE_WEBHOOK_SECRET` must be stored before deploy.
5. **Bootstrap Environment** reruns provider config in `--apply-if-configured` mode, validates one GitHub Environment, generates `.env.deploy`, syncs runtime env to Vercel, links Supabase, and pushes migrations.
6. Normal deploys repeat validation, Vercel env sync, migration push, Vercel deploy, and smoke tests.

The machine-readable deploy contract is `ENV_CONTRACT` in [`scripts/generate-env.mjs`](../scripts/generate-env.mjs). Keep it aligned with [`lib/env.ts`](../lib/env.ts), [`.env.example`](../.env.example), workflow `env:` blocks, and this document.
