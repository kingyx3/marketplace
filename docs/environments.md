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

Every workflow job that directly reads the GitHub Actions `vars` or `secrets` contexts declares its target GitHub Environment at the job level. Reusable-workflow callers may use `secrets: inherit`; the called workflow is responsible for attaching the environment to the jobs that consume those values.

## Shared repository settings

Repository secrets:

- `GCP_TERRAFORM_CREDENTIALS_JSON`
- `VERCEL_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `SENTRY_AUTH_TOKEN` for staging/production source-map uploads

Repository variables:

- `SENTRY_ORG` and `SENTRY_PROJECT` for staging/production source-map uploads

The Sentry organization/project slugs and auth token are shared build settings. They are intentionally not duplicated across GitHub Environments.

## Per-environment operator inputs

Common variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SENTRY_DSN` (optional in development; required by bootstrap for staging and production)
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

The DSN is the only Sentry runtime setting stored per environment. Environment names come from Vercel/target metadata, releases use the Vercel Git commit SHA, trace sampling defaults to `1.0` outside production and `0.1` in production, background replay is disabled, and replay-on-error is enabled. Bootstrap removes redundant environment-scoped Sentry build settings so repository values cannot be shadowed.

Staging additionally carries recovery-project/database inputs, operations ownership, escalation, and SLO targets. Production carries operations ownership, escalation, SLO targets, backup retention, an optional advisor allow-list, and required reviewers when the GitHub Environment is first created. See `docs/bootstrap.md` for the exact prefixed shell names and defaults.

## Automatically resolved or generated

- `SUPABASE_PROJECT_REF`, URL, database password, and project topology from Terraform.
- Supabase publishable key and, when available, modern server secret key from the Management API.
- Vercel project/scope metadata from Terraform and Vercel APIs.
- Stripe endpoint id by exact URL match.
- Stripe signing secret during transactional create/replacement, persisted directly to Vercel.
- Sentry environment names and releases from deployment metadata.

## Hosted topology

Terraform manages by default:

- the primary Vercel project used by development previews and production;
- Supabase projects for `development` and `production`.

Set the repository variable `ENABLE_RELEASE_TOPOLOGY=true` to additionally manage:

- a dedicated staging Vercel project;
- Supabase projects for `staging` and `recovery`.

`development` and `production` are always deploy/bootstrap targets. `staging` is accepted only when the extended topology is enabled. `recovery` is used by hosted restore verification and is not a deploy target. Because one Terraform state owns the entire platform topology, `ENABLE_RELEASE_TOPOLOGY` is repository-scoped rather than environment-scoped.

## GitHub CLI intake

`npm run bootstrap:github` is plan-only and defaults to `development`. `npm run bootstrap:github:apply` creates or reconciles the selected Environment, its deployment policies, variables, supplied secrets, and—when production is selected—required reviewers. It also stores the repository-wide `ENABLE_RELEASE_TOPOLOGY` flag, defaulting it to `false`.

```bash
npm run bootstrap:github:apply
npm run bootstrap:github:apply -- --target=production
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap:github:apply -- --target=staging
```

Environment-specific shell values use the matching `DEVELOPMENT_`, `STAGING_`, or `PRODUCTION_` prefix. Shared Sentry build values use the unprefixed names `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. Values are never printed. The normal end-to-end entry point is `npm run bootstrap -- --apply`, which invokes governance and target-aware GitHub intake automatically before dispatching **Bootstrap & Deploy** from `main`.

## Optional Terraform overrides

Repository variables remain available when defaults cannot be inferred:

- `ENABLE_RELEASE_TOPOLOGY` (defaults to `false`)
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

The hosted bootstrap workflow automatically verifies the selected environment after deployment. Production runs infrastructure/provider readiness before migration and deep readiness after deployment. Staging does the same when the extended release topology is enabled.

For targeted diagnostics, run **Bootstrap Environment** with `mode=verify` or use `npm run bootstrap:verify` from an authenticated shell. Verification is non-mutating and fails when Terraform, provider settings, Vercel runtime values, or deployed health differ from the resolved desired state.

See the generated reference for the complete application runtime/deploy key list, `docs/observability.md` for Sentry verification and privacy controls, and `docs/bootstrap.md` for bootstrap-only operational inputs.
