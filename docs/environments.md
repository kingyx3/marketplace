# Environments & configuration contract

GitHub Environments are the source of truth for deployed runtime configuration. CI reads GitHub Environment variables and secrets, validates them, generates a temporary `.env.deploy`, syncs runtime keys to Vercel, links the selected Supabase project, pushes migrations, and deploys.

For the current free-tier setup, use one Vercel project and two Supabase projects. Vercel Preview is the hosted development target; Vercel Production is the live target. Keep `staging` reserved and empty until the app moves to paid plans.

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to any non-`main` branch, unless docs-only | `preview` in the shared Vercel project | Hosted development Supabase project | Active |
| `staging` | None | None | None | Reserved |
| `production` | Tag `v*` or published release | `production` in the shared Vercel project | Hosted production Supabase project | Active |

The deploy-time machine-readable contract is `ENV_CONTRACT` in [`scripts/generate-env.mjs`](../scripts/generate-env.mjs). The runtime schema in [`lib/env.ts`](../lib/env.ts), local template [`.env.example`](../.env.example), and workflow `env:` blocks must stay aligned with it. Validation logs key names only, never values.

Local Supabase adds two CLI-only Google OAuth keys, `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`, because [`supabase/config.toml`](../supabase/config.toml) reads those names. They are for local `.env` only and are not synced to Vercel.

## Environment lifecycle

1. Repository-level Terraform secrets and optional variables are configured under **Settings → Secrets and variables → Actions**.
2. **Terraform State Bootstrap** creates or reconciles the GCS state bucket.
3. **Terraform Platform** creates or reconciles the shared Vercel project and active Supabase projects.
4. Terraform outputs and provider dashboard values are copied into the `development` and `production` GitHub Environments.
5. **Configure Google OAuth** applies the hosted Google provider to each Supabase project after Google Cloud OAuth clients exist.
6. **Bootstrap Environment** validates one GitHub Environment, syncs runtime env to Vercel, links Supabase, and pushes migrations.
7. Normal deploys repeat validation, Vercel env sync, migration push, Vercel deploy, and smoke tests.

For the full start-to-finish flow, see [`docs/bootstrap.md`](bootstrap.md).

## Repository-level Actions inputs for Terraform

### Repository secrets

| Secret | Required | Used by | Notes |
| --- | --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Yes | `terraform-state-bootstrap.yml`, `terraform-platform.yml` | Google Cloud service account JSON. |
| `VERCEL_API_TOKEN` | Yes for platform apply | `terraform-platform.yml` | Vercel API token used by Terraform. |
| `SUPABASE_ACCESS_TOKEN` | Yes for platform apply | `terraform-platform.yml` | Supabase token used by Terraform. |

### Repository variables

| Variable | Required | Default / notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | Optional | Derived from the Google credential JSON when omitted. |
| `PROJECT_SLUG` | Optional | Derived from the repository name; normally `marketplace`. |
| `TF_STATE_BUCKET_NAME` | Optional | Derived from GCP project id and project slug. |
| `TF_STATE_BUCKET_LOCATION` | Optional | Defaults to `us-central1`. |
| `SUPABASE_ORGANIZATION_ID` | Sometimes | Required when the Supabase token can access zero or multiple organizations. |
| `VERCEL_TEAM_ID` | Optional | Empty for personal Vercel accounts. |
| `VERCEL_PROJECT_NAME` | Optional | Defaults to project slug. |
| `VERCEL_ROOT_DIRECTORY` | Optional | Empty while the app lives at repository root. |
| `SUPABASE_REGION` | Optional | Defaults to `ap-southeast-1`. |
| `SUPABASE_INSTANCE_SIZE` | Optional | Defaults to `micro`. |

## GitHub Environment secrets

Set these separately in each active environment unless a row says optional. `development` should use test/sandbox provider values; `production` should use live provider values.

| Secret | Required | Used by |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Yes | Supabase CLI migration pushes, `supabase link`, and hosted Auth configuration. Can match the repository secret of the same name. |
| `SUPABASE_DB_PASSWORD` | Yes | `supabase link`. Comes from the matching Supabase project password; Terraform-generated passwords live in remote state unless reset in Supabase. |
| `SUPABASE_SECRET_KEY` | Yes | Server-side Supabase runtime access in Vercel. |
| `STRIPE_SECRET_KEY` | Yes | Server-side Stripe runtime access. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signature verification. |
| `VERCEL_TOKEN` | Yes | Vercel env sync and Vercel deploy. Can match repository secret `VERCEL_API_TOKEN`. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes for hosted Google sign-in | Hosted Supabase Auth Google provider secret from Google Cloud. Used by **Configure Google OAuth**. |
| `RESEND_API_KEY` | Optional | Email provider. Missing key disables email delivery paths that depend on Resend. |
| `TWILIO_AUTH_TOKEN` | Optional | SMS provider token. |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram Bot API token. |
| `WHATSAPP_ACCESS_TOKEN` | Optional | WhatsApp Cloud API token. |

## GitHub Environment variables

| Variable | Required | Used by / notes |
| --- | --- | --- |
| `APP_NAME` | Yes | Display name shown in app chrome, metadata, health output, and emails. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical public URL for the environment. Used by app runtime and Google OAuth planning. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project API URL: `https://<project-ref>.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable key; access is RLS-enforced. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key. Use test mode for `development`, live mode for `production`. |
| `SUPABASE_PROJECT_REF` | Yes | Terraform output for the matching Supabase project; used by `supabase link` and hosted Auth configuration. |
| `VERCEL_ORG_ID` | Yes | Vercel account/team id read by the Vercel CLI. |
| `VERCEL_PROJECT_ID` | Yes | Terraform output `vercel_project_id`; same value in both active GitHub Environments. |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes for hosted Google sign-in | Hosted Supabase Auth Google provider client id from Google Cloud. Used by **Configure Google OAuth**. |
| `RESEND_FROM_EMAIL` | Optional | Verified sender address for email. |
| `SUPPORT_EMAIL` | Optional | Support contact shown in transactional emails. |
| `TWILIO_ACCOUNT_SID` | Optional | SMS provider account id. |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional | WhatsApp Cloud API sender phone-number id. |

Do not store `TARGET_ENV` manually in a GitHub Environment. Workflows set it from their caller input (`development` or `production`) and validation only accepts those two values.

## Runtime vs deploy-only keys

Runtime keys are written to `.env.deploy` and synced to Vercel. Deploy-only keys are validated and used by CI but are not written into Vercel runtime env.

| Key | Runtime? | Deploy-only? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | No |
| `SUPABASE_SECRET_KEY` | Yes, server-only | No |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | No |
| `STRIPE_SECRET_KEY` | Yes, server-only | No |
| `STRIPE_WEBHOOK_SECRET` | Yes, server-only | No |
| `NEXT_PUBLIC_SITE_URL` | Yes | No |
| `APP_NAME` | Yes | No |
| Optional notification keys | Yes when set | No |
| `TARGET_ENV` | No | Yes |
| `SUPABASE_ACCESS_TOKEN` | No | Yes |
| `SUPABASE_DB_PASSWORD` | No | Yes |
| `SUPABASE_PROJECT_REF` | No | Yes |
| `VERCEL_TOKEN` | No | Yes |
| `VERCEL_ORG_ID` | No | Yes |
| `VERCEL_PROJECT_ID` | No | Yes |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | No | Used only by the OAuth configuration workflow |

## Google OAuth setup

The app code is wired for Supabase Auth + Google OAuth:

- `/auth/sign-in` starts `signInWithOAuth({ provider: "google" })` and redirects to `/auth/callback`.
- `/auth/callback` exchanges the PKCE code for a Supabase session cookie.
- Middleware refreshes Supabase SSR cookies with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- The sign-in request asks Google for `access_type=offline` and `prompt=consent select_account` so Google can issue provider refresh tokens when allowed.

What the repo can generate/apply:

1. Run `npm run oauth:google:plan` locally to print Google Cloud origins, Google redirect URIs, Supabase redirect allow-list entries, and local `.env` names for the current environment.
2. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to the target GitHub Environment.
3. Run **Configure Google OAuth** for `development` or `production`.
4. The workflow calls the Supabase Management API to enable the Google provider on `SUPABASE_PROJECT_REF`, then verifies `/auth/v1/settings` reports Google as enabled.

What cannot be generated from this repo:

- The Google OAuth client id and client secret. Create them in Google Cloud as a **Web application** OAuth client.
- Google consent screen branding, audience, verification status, and scopes. Configure at least `openid`, email, and profile scopes in Google Cloud.
- Hosted Supabase redirect allow-list entries when the Supabase project requires dashboard edits for URL configuration. Use the URLs printed by `npm run oauth:google:plan`.

Hosted Google Cloud values:

- Authorized JavaScript origin: the origin from `NEXT_PUBLIC_SITE_URL`.
- Authorized redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.

Local development values:

- `.env`: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<Google web client id>`
- `.env`: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google web client secret>`
- Google Authorized JavaScript origin: `http://localhost:3000`
- Google Authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

## Downstream sync

Deployment never treats Vercel as the source of truth. The deploy workflow:

1. Validates the selected GitHub Environment.
2. Generates `.env.deploy` from GitHub Environment values.
3. Syncs runtime keys to the matching Vercel target: `development` → `preview`, `production` → `production`.
4. Removes unset optional runtime keys from that target to avoid stale config.
5. Pushes Supabase migrations to `SUPABASE_PROJECT_REF`.
6. Deploys to Vercel and smoke tests `/api/health`.
7. Runs `/api/health?deep=1` for production.

The generated `.env.deploy` file is temporary, gitignored, and removed during bootstrap/deploy jobs.

## Bootstrap per environment

Once provider accounts, Terraform outputs, and GitHub Environment values exist:

1. Run **Configure Google OAuth** for the environment after the Google OAuth client id/secret are available.
2. Run **Bootstrap Environment** for `development` or `production`.
3. Bootstrap validates GitHub config, syncs Vercel env, links Supabase, and applies migrations.
4. Bootstrap does not perform a regular app deployment.
5. For production, add required reviewers under GitHub Environment protection before launch.

After bootstrap, normal deploys create/update downstream Vercel runtime env, apply Supabase schema changes, deploy the app, and smoke test it.