# Deployment

## Pipeline

`deploy.yml` is a reusable workflow invoked by active environment callers. The current free-tier topology has two hosted environments:

| Caller | Trigger | Environment | Notes |
| --- | --- | --- | --- |
| `deploy-development.yml` | Push to non-`main` branches | `development` | Skips docs-only changes and skips branch deploys until the shared deploy prerequisite secrets are configured. |
| `deploy-production.yml` | Push tag `v*` or publish a release | `production` | Pauses on required GitHub Environment reviewers before mutable production jobs run. |

`staging` is intentionally empty for now. Recreate a staging caller only when a third hosted Vercel/Supabase project pair is available.

Checks run before mutable deploy work:

```text
validate-env ------+
migration-check ---+--> migrate --+
app-checks -----------------------+--> deploy --> smoke
```

## What each job does

| Job | Purpose |
| --- | --- |
| `deploy-ready` | Development caller only: confirms the branch push is still current and checks that `GCP_TERRAFORM_CREDENTIALS_JSON`, `VERCEL_TOKEN`, and `SUPABASE_ACCESS_TOKEN` exist before invoking the reusable deploy. It logs missing key names only. |
| `validate-env` | Targets the selected GitHub Environment, initializes Terraform state, resolves Terraform/provider values with `scripts/resolve-environment.mjs`, validates `SUPABASE_PROJECT_REF`, and runs pre-provision environment validation with `scripts/generate-env.mjs --check --allow-missing-provisioned`. |
| `app-checks` | Runs lint, typecheck, unit tests, and build in parallel after `npm ci`. |
| `migration-check` | Applies the auth shim, every SQL migration, and seed data to a clean Postgres service. |
| `migrate` | Resolves Terraform/provider values, links the selected hosted Supabase project, and runs `supabase db push`. |
| `deploy` | Resolves Terraform/provider values, injects any Vercel-stored Stripe signing secret into `scripts/provision-stripe-webhook.mjs`, creates/replaces/updates the endpoint as needed, generates `.env.deploy`, syncs runtime env to Vercel, deploys with `scripts/deploy-vercel.mjs`, and removes the temporary env file. |
| `smoke` | Checks `/api/health`; production also checks `/api/health?deep=1`. |

## Notes

- Development deploys ignore docs-only changes. Until `GCP_TERRAFORM_CREDENTIALS_JSON`, `VERCEL_TOKEN`, and `SUPABASE_ACCESS_TOKEN` exist in the development GitHub Environment or at repository scope, branch deploys skip cleanly; once those prerequisites are present, branch pushes run the full development deploy suite.
- Pull request CI is secretless and separate from deploys. Protect `main` with lint, typecheck, unit tests, build, config checks, and migration checks before production releases are tagged.
- Public runtime and deploy-routing values come from Terraform outputs, provider APIs, GitHub Environment vars, and optional local fallback. Do not copy Terraform outputs into committed config.
- Vercel dashboard env is not canonical. The deploy workflow always pushes runtime env from the resolved environment.
- `VERCEL_TOKEN` is the single Vercel token name. Do not duplicate it as `VERCEL_API_TOKEN`.
- Supabase migrations are forward-only. A failed migration should be fixed with a new migration, not by editing an applied migration.

## Bootstrap versus deploy

| Workflow | When to use | Important limitation |
| --- | --- | --- |
| **Terraform State Bootstrap** | Create/reconcile the shared GCS state bucket. | Run once; it does not create app provider projects or deploy the app. |
| **Terraform Platform** | Create/reconcile the shared Vercel project and both active Supabase project shells. | Run once; it does not fill runtime secrets or push app migrations. |
| **Configure Providers** | Plan/apply/verify hosted Supabase Google Auth and explicitly reconcile an existing Stripe webhook. | Its GitHub Actions path cannot create the first Stripe endpoint because it cannot persist the one-time signing secret. |
| **Bootstrap Environment** | Sync Vercel env, link Supabase, and push migrations without deploying the app. | Before first deploy, it requires `STRIPE_WEBHOOK_SECRET` to have been pre-provisioned into the selected GitHub Environment. |
| **Deploy development/production** | Normal release path; it can also perform first-time Stripe webhook provisioning. | It does not create Google Cloud OAuth clients or GitHub Environment values. |

For the exact deploy-first and bootstrap-before-deploy sequences, see `docs/bootstrap.md`.

## Rollback

- **App**: Vercel keeps every deployment immutable. Promote the previous deployment with `vercel rollback` or the dashboard.
- **Database**: migrations are forward-only. To undo schema, write a new reverting migration; never edit or delete an applied migration.
- **Config**: change the GitHub Environment variable/secret or Terraform/provider source, then rerun deploy so CI re-syncs Vercel and redeploys from the corrected source of truth.
- **Provider config**: correct the provider dashboard prerequisite or GitHub Environment secret; rerun **Configure Providers**, then rerun bootstrap/deploy as needed.

## Releasing to production

```bash
git tag v0.2.0
git push origin v0.2.0
```

Alternatively publish a GitHub release. The `production` deploy starts, then pauses for required-reviewer approval on the GitHub Environment before jobs that target production run.

## Production readiness checks

For a first production launch, use the bootstrap-before-deploy path so OAuth and Stripe settings can be verified before the release tag is cut:

1. Confirm `production` has required reviewers.
2. Confirm shared secrets and production environment vars/secrets from `docs/environments.md` are present.
3. Run **Terraform Platform** with `apply=true` after reviewing the plan.
4. Pre-provision the production Stripe endpoint locally and store `STRIPE_WEBHOOK_SECRET` in the production GitHub Environment.
5. Run **Configure Providers** in `plan`, then `apply`, for `production`.
6. Run **Bootstrap Environment** for `production`.
7. Confirm Stripe live webhook endpoint points to `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe` and uses the matching signing secret.
8. Confirm Google sign-in works against the production Supabase project.
9. Cut the release tag and confirm `/api/health` and `/api/health?deep=1` return HTTP 200 after deploy.
