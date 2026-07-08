# Deployment

## Pipeline

`deploy.yml` is a reusable workflow invoked by active environment callers. The current free-tier topology has two hosted environments:

| Caller | Trigger | Environment | Notes |
| --- | --- | --- | --- |
| `deploy-development.yml` | Push to non-`main` branches | `development` | Skips docs-only changes through `paths-ignore`. |
| `deploy-production.yml` | Push tag `v*` or publish a release | `production` | Should pause on required GitHub Environment reviewers. |

`staging` is intentionally empty for now. Recreate a staging caller only when a third hosted Vercel/Supabase project pair is available.

Checks run before mutable deploy work:

```text
validate-env ─────┐
migration-check ──┴─▶ migrate ──┐
app-checks ─────────────────────┴─▶ deploy ──▶ smoke
```

## What each job does

| Job | Purpose |
| --- | --- |
| `validate-env` | Targets the selected GitHub Environment, requires `development` or `production`, checks deploy-only keys, validates `SUPABASE_PROJECT_REF`, and runs `scripts/generate-env.mjs --check`. |
| `app-checks` | Runs lint, typecheck, unit tests, and build in parallel after `npm ci`. |
| `migration-check` | Applies the auth shim, every SQL migration, and seed data to a clean Postgres service. |
| `migrate` | Links the selected hosted Supabase project and runs `supabase db push`. |
| `deploy` | Generates `.env.deploy`, syncs runtime env from GitHub to Vercel, removes the generated env file, then runs `npx vercel deploy` with `--prod` only for production. |
| `smoke` | Checks `/api/health`; production also checks `/api/health?deep=1`. |

## Notes

- Development deploys ignore docs-only changes.
- Pull request CI is secretless and separate from deploys. Protect `main` with lint, typecheck, unit tests, build, config checks, and migration checks before production releases are tagged.
- Runtime config changes are made in GitHub Environments, then reconciled by rerunning deploy or **Bootstrap Environment**.
- Vercel dashboard env is not canonical. The deploy workflow always pushes runtime env from GitHub Environment values.
- `VERCEL_ORG_ID` is the Vercel deploy scope id. On Hobby, set it to the personal user id; when moving to a team/org, replace it with the team/org id and update `VERCEL_PROJECT_ID` if the project changes.
- Supabase migrations are forward-only. A failed migration should be fixed with a new migration, not by editing an applied migration.

## Bootstrap versus deploy

| Workflow | When to use | What it does not do |
| --- | --- | --- |
| **Terraform State Bootstrap** | Create/reconcile the GCS state bucket. | Does not create app provider projects or deploy the app. |
| **Terraform Platform** | Create/reconcile Vercel and Supabase project shells. | Does not fill GitHub Environment runtime values or push app migrations. |
| **Configure Providers** | Apply hosted provider settings that can be safely managed by API after provider prerequisites exist. | Does not create Google Cloud OAuth clients, Vercel/Supabase projects, or provider account settings. |
| **Bootstrap Environment** | Reconcile one active environment after secrets/vars exist: provider config, validate, generate env, sync Vercel env, link Supabase, push migrations. | Does not deploy the app. |
| **Deploy development/production** | Normal release path after bootstrap. | Does not create provider projects. |

For the full setup flow, see [`docs/bootstrap.md`](bootstrap.md).

## Rollback

- **App**: Vercel keeps every deployment immutable. Promote the previous deployment with `vercel rollback` or the dashboard.
- **Database**: migrations are forward-only. To undo schema, write a new reverting migration; never edit or delete an applied migration.
- **Config**: change the GitHub Environment value, then rerun deploy so CI re-syncs Vercel and redeploys from the corrected source of truth.
- **Provider config**: correct the provider dashboard prerequisite or GitHub Environment value, rerun **Configure Providers**, then rerun bootstrap/deploy as needed.

## Releasing to production

```bash
git tag v0.2.0
git push origin v0.2.0
```

Alternatively publish a GitHub release. The `production` deploy starts, then pauses for required-reviewer approval on the GitHub Environment before jobs that target production run.

## Production readiness checks

Before cutting a production tag:

1. Confirm `production` has required reviewers.
2. Confirm all required `production` GitHub Environment variables and secrets from [`docs/environments.md`](environments.md) are present.
3. Run **Bootstrap Environment** for `production` after config changes.
4. Confirm Stripe live webhook endpoint points to `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe` and uses the matching `STRIPE_WEBHOOK_SECRET`.
5. Confirm Google sign-in works against the production Supabase project.
6. Confirm `/api/health` and `/api/health?deep=1` return HTTP 200 after deploy.
