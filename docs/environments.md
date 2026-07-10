# Environments and configuration

The canonical machine-readable contract is `config/environment-contract.json`. The following files are generated from it and must not be edited directly:

- `.env.example`
- `lib/env-contract.generated.ts`
- `docs/generated/environment-reference.md`

Run `npm run env:artifacts:write` after changing the contract. CI runs `npm run config:check` and fails on drift.

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

## Per-environment operator inputs

Variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `GOOGLE_AUTH_ENABLED` (`true` by default)
- `GOOGLE_OAUTH_CLIENT_ID` when Google Auth is enabled

Secrets:

- `STRIPE_SECRET_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET` when Google Auth is enabled
- `SUPABASE_SECRET_KEY` only as a fallback when it cannot be resolved through the Management API
- `STRIPE_WEBHOOK_SECRET` only as an optional recovery override

## Automatically resolved or generated

- `SUPABASE_PROJECT_REF`, URL, database password, and project topology from Terraform.
- Supabase publishable key and, when available, modern server secret key from the Management API.
- Vercel project/scope metadata from Terraform and Vercel APIs.
- Stripe endpoint id by exact URL match.
- Stripe signing secret during transactional create/replacement, persisted directly to Vercel.

## GitHub CLI intake

`npm run bootstrap:github` is plan-only. `npm run bootstrap:github -- --apply` creates/reconciles environments, branch policies, supplied values, and production reviewers. Per-environment shell values use `DEVELOPMENT_` and `PRODUCTION_` prefixes. Values are never printed.

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

After applying bootstrap, run **Bootstrap Environment** again with `mode=verify`. This is non-mutating and fails when Terraform, provider settings, Vercel runtime values, or deployed health differ from the resolved desired state. The same check is available from an authenticated shell as `npm run bootstrap:verify`.

See the generated reference for the complete runtime/deploy key list.
