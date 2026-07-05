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
  and migration SQL validation before database changes or Vercel deploys
  can run.
- **Minimal GitHub env**: GitHub stores only the deploy/migration values
  listed in `docs/environments.md`. The target environment is generated
  from the workflow input and is not stored as a GitHub variable.
- **Vercel-owned runtime env**: app runtime configuration lives in Vercel
  Project Environment Variables. The deploy job runs `vercel pull`, validates
  the pulled env with `scripts/generate-env.mjs`, and deploys only if it is
  complete.
- **Vercel config**: `vercel.json` is checked in with the Next.js
  framework, build/install commands, security headers, and API no-store
  cache policy. `npm run config:check` validates this contract in CI.
- **Supabase config**: durable database/storage state is SQL migration
  driven. `npm run config:check` validates local Supabase config,
  product-image storage setup, explicit storage grants, and RLS coverage.
- **Migrations before app**: a failed migration push stops the rollout; the
  previous app version keeps running against the old schema.
- **Smoke/readiness**: every deploy checks shallow `/api/health`. Staging and
  production also call `/api/health?deep=1` after deploy to verify Supabase
  connectivity, Stripe config presence, and notification channel status
  without printing sensitive values.

## Rollback

- **App**: Vercel keeps every deployment immutable — promote the previous
  deployment (`vercel rollback` or dashboard) instantly.
- **Database**: migrations are forward-only. To undo schema, write a new
  reverting migration; never edit or delete an applied migration. Supabase
  point-in-time recovery (paid tier) is the disaster path.
- **Runtime env**: rotate in the provider dashboard, update Vercel Project
  Environment Variables, then re-run deploy. For deploy-only credentials,
  rotate the GitHub Environment entries listed in `docs/environments.md`.

## Releasing to production

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `production` deploy starts, then **pauses for required-reviewer approval**
on the GitHub Environment before any job runs.
