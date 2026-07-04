# Deployment

## Pipeline

`deploy.yml` is a reusable workflow (`workflow_call`) invoked by three
thin callers. Checks run in parallel where safe, and mutable deploy work
waits for the checks it depends on:

```
validate-env ─────┐
migration-check ──┴─▶ migrate ──┐
app-checks ─────────────────────┴─▶ deploy ──▶ smoke
```

| Caller                   | Trigger                      | Environment                   |
| ------------------------ | ---------------------------- | ----------------------------- |
| `deploy-development.yml` | push to non-`main` branches  | `development`                 |
| `deploy-staging.yml`     | push to `main`               | `staging`                     |
| `deploy-production.yml`  | tag `v*` / release published | `production` (human approval) |

Notes:

- **Docs-only guard**: both push-triggered callers ignore `docs/**` and
  `**/*.md`, so documentation changes never trigger a deploy. CI's
  `changes` job does the same for test jobs on PRs.
- **CI gating**: `ci.yml` runs lint / typecheck / unit tests / build /
  migration-apply in parallel on every PR. Enable branch protection on
  `main` with those as required checks so staging only ever deploys
  already-green code.
- **Deploy gating**: branch, main, and release deploys run app checks
  and migration SQL validation before `supabase db push` or Vercel env
  sync/deploy can run.
- **Environment guard**: each GitHub Environment sets `TARGET_ENV`.
  The reusable workflow fails before migrations if `TARGET_ENV` does
  not match the caller-provided environment.
- **Env sync**: the deploy job regenerates the runtime `.env`, including
  `APP_NAME`, from GitHub Environment values and pushes it to Vercel on
  every deploy — the dashboard is never hand-edited (config as code).
- **Migrations before app**: a failed `supabase db push` stops the
  rollout; the previous app version keeps running against the old schema.
- **Smoke/readiness**: every deploy checks shallow `/api/health`.
  Staging and production also call `/api/health?deep=1` after deploy to
  verify Supabase connectivity, Stripe config presence, and notification
  channel status without printing secret values.

## Rollback

- **App**: Vercel keeps every deployment immutable — promote the
  previous deployment (`vercel rollback` or dashboard) instantly.
- **Database**: migrations are forward-only. To undo schema, write a new
  reverting migration; never edit or delete an applied migration.
  Supabase point-in-time recovery (paid tier) is the disaster path.
- **Secrets**: rotate in the provider dashboard, update the GitHub
  Environment, re-run deploy (which re-syncs Vercel).

## Releasing to production

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `production` deploy starts, then **pauses for required-reviewer
approval** on the GitHub Environment before any job runs.
