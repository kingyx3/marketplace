# Deployment

## Pipeline

`deploy.yml` is a reusable workflow invoked by active environment callers. The
current free-tier topology has two hosted environments:

| Caller | Trigger | Environment |
| --- | --- | --- |
| `deploy-development.yml` | push to non-`main` branches | `development` |
| `deploy-production.yml` | tag `v*` / release published | `production` |

`staging` is intentionally empty for now. Recreate a staging caller when a third
hosted Vercel/Supabase project pair is available.

Checks run before mutable deploy work:

```
validate-env ─────┐
migration-check ──┴─▶ migrate ──┐
app-checks ─────────────────────┴─▶ deploy ──▶ smoke
```

Notes:

- Development deploys ignore docs-only changes.
- CI should protect `main` with lint, typecheck, unit tests, build, config checks,
  and migration checks before production releases are tagged.
- Deployment validates the selected GitHub Environment, syncs runtime env to
  Vercel, pushes Supabase migrations, deploys, and smoke tests `/api/health`.
- Production also runs `/api/health?deep=1`.
- Runtime config changes are made in GitHub Environments, then reconciled by
  rerunning deploy or **Bootstrap Environment**.

## Rollback

- **App**: Vercel keeps every deployment immutable — promote the previous
  deployment (`vercel rollback` or dashboard) instantly.
- **Database**: migrations are forward-only. To undo schema, write a new
  reverting migration; never edit or delete an applied migration.
- **Config**: change the GitHub Environment value, then re-run deploy so CI
  re-syncs Vercel and redeploys from the corrected source of truth.

## Releasing to production

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `production` deploy starts, then pauses for required-reviewer approval on
the GitHub Environment before any job runs.
