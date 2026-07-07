# Deployment

## Pipeline

`deploy.yml` is a reusable workflow (`workflow_call`) invoked by three thin
callers. Checks run in parallel where safe, and mutable deploy work waits for
the checks it depends on:

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
  `**/*.md`, so documentation changes never trigger a deploy. CI's `changes`
  job does the same for test jobs on PRs.
- **CI gating**: `ci.yml` runs lint / typecheck / unit tests / build /
  migration-apply in parallel on every PR. Enable branch protection on `main`
  with those as required checks so staging only ever deploys already-green code.
- **Deploy gating**: branch, main, and release deploys run app checks and
  migration SQL validation before database changes or Vercel deploys can run.
- **GitHub-owned config**: each GitHub Environment stores the complete desired
  configuration for that environment. CI validates it before any mutable work.
- **Downstream env sync**: deploy generates `.env.deploy` from GitHub
  Environment values, syncs runtime keys to Vercel with
  `scripts/sync-vercel-env.mjs`, removes unset optional keys from Vercel, and
  then deploys.
- **Vercel config**: `vercel.json` is checked in with the Next.js framework,
  build/install commands, security headers, and API no-store cache policy.
  `npm run config:check` validates this contract in CI.
- **Supabase config**: durable database/storage state is SQL migration driven.
  `npm run config:check` validates local Supabase config, product-image storage
  setup, explicit storage grants, and RLS coverage.
- **Migrations before app**: a failed migration push stops the rollout; the
  previous app version keeps running against the old schema.
- **Smoke/readiness**: every deploy checks shallow `/api/health`. Staging and
  production also call `/api/health?deep=1` after deploy to verify Supabase
  connectivity, Stripe config presence, and notification channel status without
  printing sensitive values.

## Rollback

- **App**: Vercel keeps every deployment immutable — promote the previous
  deployment (`vercel rollback` or dashboard) instantly.
- **Database**: migrations are forward-only. To undo schema, write a new
  reverting migration; never edit or delete an applied migration. Supabase
  point-in-time recovery (paid tier) is the disaster path.
- **Config**: change the GitHub Environment value, then re-run deploy so CI
  re-syncs Vercel and redeploys from the corrected source of truth.

## Releasing to production

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `production` deploy starts, then **pauses for required-reviewer approval**
on the GitHub Environment before any job runs.
