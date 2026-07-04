# Environments & configuration contract

Three GitHub Environments, mapped by trigger:

| Environment   | Trigger                       | Stripe mode | Approval               |
| ------------- | ----------------------------- | ----------- | ---------------------- |
| `development` | push to any non-`main` branch | test        | none                   |
| `staging`     | push to `main`                | test        | none                   |
| `production`  | tag `v*` / release published  | **live**    | **required reviewers** |

The canonical machine-readable contract is `ENV_CONTRACT` in
[`scripts/generate-env.mjs`](../scripts/generate-env.mjs); `.env.example`
and `lib/env.ts` mirror it. CI fails fast (before touching infra) if an
environment is missing or malformed — key names only, values never logged.
`TARGET_ENV` is deploy-time only and must exactly match the selected
GitHub Environment name.

## Required per environment

### Secrets (GitHub Environment → Secrets)

| Key                         | Used by                         | Where to get it                                       |
| --------------------------- | ------------------------------- | ----------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`     | migrations (`supabase db push`) | supabase.com → Account → Access Tokens                |
| `SUPABASE_DB_PASSWORD`      | `supabase link`                 | Supabase project → Settings → Database                |
| `SUPABASE_SERVICE_ROLE_KEY` | app runtime (server only)       | Supabase project → Settings → API                     |
| `STRIPE_SECRET_KEY`         | app runtime                     | Stripe dashboard → Developers → API keys              |
| `STRIPE_WEBHOOK_SECRET`     | webhook verification            | Stripe dashboard → Webhooks → endpoint signing secret |
| `VERCEL_TOKEN`              | deploy                          | vercel.com → Account → Tokens                         |

### Vars (GitHub Environment → Variables, non-secret)

| Key                                   | Example                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | `https://abcd1234.supabase.co`                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | anon/publishable key (safe to expose; RLS-enforced)       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | `pk_test_...` in dev/staging, `pk_live_...` in production |
| `NEXT_PUBLIC_SITE_URL`                | `https://staging.example.com`                             |
| `TARGET_ENV`                          | `development`, `staging`, or `production`                 |
| `SUPABASE_PROJECT_REF`                | `abcd1234`                                                |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | from `vercel link` → `.vercel/project.json`               |

### Optional (notification channels — missing key = channel disabled)

| Key                     | Type   | Channel  |
| ----------------------- | ------ | -------- |
| `RESEND_API_KEY`        | secret | email    |
| `TWILIO_ACCOUNT_SID`    | var    | SMS      |
| `TWILIO_AUTH_TOKEN`     | secret | SMS      |
| `TELEGRAM_BOT_TOKEN`    | secret | Telegram |
| `WHATSAPP_ACCESS_TOKEN` | secret | WhatsApp |

## One-time bootstrap (manual, per environment)

CI cannot create provider accounts. Once, per environment:

1. Create a Supabase project; note ref, DB password, anon + service keys.
2. Create a Vercel project (`vercel link` locally gives org/project ids).
3. Create a Stripe webhook endpoint pointing at
   `<site-url>/api/webhooks/stripe`; note the signing secret.
4. Create the GitHub Environment and enter the tables above.
5. `production` only: add required reviewers under Environment protection.

After bootstrap, everything flows from git: migrations, env sync to
Vercel, deploys, smoke tests.
