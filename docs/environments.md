# Environments and configuration

The canonical machine-readable runtime/deploy contract is `config/environment-contract.json`. The following files are generated from it and must not be edited directly:

- `.env.example`
- `lib/env-contract.generated.ts`
- `docs/generated/environment-reference.md`

Run `npm run env:artifacts:write` after changing the contract. CI runs `npm run config:check` and fails on drift.

GitHub bootstrap intake also includes release-readiness values that are not application runtime keys, such as operations ownership, SLOs, recovery database URLs, and production backup policy. `scripts/bootstrap-github.mjs` is the executable contract for that intake; `docs/bootstrap.md` lists the shell names and defaults.

## Resolution order

Hosted jobs resolve values in this order:

1. GitHub Environment/repository vars and secrets already in the job.
2. Terraform outputs.
3. Supabase, Vercel, and Stripe APIs.
4. Stable defaults in `config/environments.json`.

Committed defaults never override explicit values.

## Shared repository secrets

- `GCP_TERRAFORM_CREDENTIALS_JSON`
- `VERCEL_TOKEN`
- `SUPABASE_ACCESS_TOKEN`

These are required by the hosted bootstrap for every target and are stored as repository-level secrets.

## Per-environment operator inputs

Common variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `GOOGLE_AUTH_ENABLED` (`true` by default)
- `GOOGLE_OAUTH_CLIENT_ID` when Google Auth is enabled
- `RESEND_FROM_EMAIL`
- `SUPPORT_EMAIL` (optional)

Common secrets:

- `STRIPE_SECRET_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET` when Google Auth is enabled
- `SUPABASE_SECRET_KEY` only as a fallback when it cannot be resolved through the Management API
- `STRIPE_WEBHOOK_SECRET` only as an optional recovery override
- `CRON_SECRET`, `SYNTHETIC_MONITOR_SECRET`, `OPERATIONAL_ALERT_WEBHOOK_URL`, `OPERATIONAL_ALERT_WEBHOOK_SECRET`, and `RESEND_API_KEY`; optional in development and required by bootstrap intake for staging and production

Staging additionally carries recovery-project/database inputs, operations ownership, escalation, and SLO targets. Production carries operations ownership, escalation, SLO targets, backup retention, an optional advisor allow-list, and required reviewers when the GitHub Environment is first created. See `docs/bootstrap.md` for the exact prefixed shell names and defaults.

## Automatically resolved or generated

- `SUPABASE_PROJECT_REF`, URL, database password, and project topology from Terraform.
- Supabase publishable key and, when available, modern server secret key from the Management API.
- Vercel project/scope metadata from Terraform and Vercel APIs.
- Stripe endpoint id by exact URL match.
- Stripe signing secret during transactional create/replacement, persisted directly to Vercel.

## Hosted topology

Terraform manages:

- the primary Vercel project used by development and production;
- a dedicated staging Vercel project;
- Supabase projects for `development`, `staging`, `recovery`, and `production`.

`development`, `staging`, and `production` are deploy/bootstrap targets. `recovery` is used by hosted restore verification and is not a deploy target.

## GitHub CLI intake

`npm run bootstrap:github` is plan-only and defaults to `development`. `npm run bootstrap:github:apply` creates or reconciles the selected Environment, its deployment policies, variables, supplied secrets, and—when production is selected—required reviewers.

```bash
npm run bootstrap:github:apply
npm run bootstrap:github:apply -- --target=staging
npm run bootstrap:github:apply -- --target=production
```

Shell values use the matching `DEVELOPMENT_`, `STAGING_`, or `PRODUCTION_` prefix. Values are never printed. The normal end-to-end entry point is `npm run bootstrap -- --apply`, which invokes governance and target-aware GitHub intake automatically before dispatching **Bootstrap & Deploy** from `main`.

## Optional Terraform overrides

Repository variables remain available when defaults cannot be inferred:

- `GCP_PROJECT_ID`
- `PROJECT_SLUG`
- `TF_STATE_BUCKET_NAME`
- `TF_STATE_BUCKET_LOCATION`
- `SUPABASE_ORGANIZATION_ID`
- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_NAME`
- `VERCEL_ROOT_DIRECTORY`
- `SUPABASE_REGION`

Supabase compute sizing is not currently part of the Terraform contract because the pinned provider does not support it. Configure paid-plan compute through Supabase directly until a tested provider version exposes a stable resource argument.

## Release-readiness verification

The hosted bootstrap workflow automatically verifies the selected environment after deployment. Staging and production also run infrastructure/provider readiness before migration and deep readiness after deployment.

For targeted diagnostics, run **Bootstrap Environment** with `mode=verify` or use `npm run bootstrap:verify` from an authenticated shell. Verification is non-mutating and fails when Terraform, provider settings, Vercel runtime values, or deployed health differ from the resolved desired state.

See the generated reference for the complete application runtime/deploy key list and `docs/bootstrap.md` for bootstrap-only operational inputs.
