# Deployment

## Pipeline

- Pull requests and `main` run secretless application, configuration, migration, and Terraform validation.
- The same reusable application-check workflow gates hosted deployment, eliminating duplicated command definitions.
- Both Terraform stacks initialize without a backend in pull-request CI, use committed multi-platform provider lockfiles, and must pass formatting and validation.
- `develop` deploys to the shared development environment.
- `v*` tags and published releases deploy production.

Hosted deployment order:

```text
pre-provision environment validation
+ production-only non-mutating Terraform/provider/runtime drift preflight
+ app checks
+ clean migration check
→ hosted migration push
→ shared runtime/provider reconciliation
→ deploy or reuse identical ready deployment
→ health checks
```

`scripts/reconcile-runtime-environment.mjs` is shared by bootstrap and deployment. It injects any Vercel-stored Stripe secret, transactionally reconciles the endpoint, applies enabled provider settings, validates the final contract, and fingerprints/syncs Vercel values.

`scripts/verify-environment.mjs` is the non-mutating release gate. It fails on Terraform changes, provider differences, missing or malformed runtime values, Vercel runtime drift, or failed health checks. Production deployment runs the drift portion before any migration or deployment; Bootstrap Environment `mode=verify` runs the full gate including health.

## Idempotency

- Hosted environment mutation workflows share one per-environment lock.
- Shared Terraform workflows use a separate global infrastructure lock.
- Terraform plans are side-effect-free, and apply consumes the exact reviewed plan artifact.
- Vercel environment writes are skipped when keyed fingerprints match.
- A source/configuration deployment key reuses an existing ready deployment.
- Stripe desired metadata and events come from one shared implementation.
- Supabase migrations are forward-only and `db push` is safe to rerun.

## Development topology

Only the `develop` integration branch automatically mutates the shared development Supabase/Vercel target. Feature branches use CI and may be manually dispatched only when intentionally selected for integration testing.

## Production

Production jobs target the protected `production` GitHub Environment. The GitHub governance reconciler configures `main` to require strict CI status checks, one independent approval, stale-review dismissal, resolved conversations, linear history, admin enforcement, and no force pushes. Production deployment performs a live drift preflight before migrations, while deep readiness checks run after deployment.

## Rollback

- Vercel application rollback: promote a previous immutable deployment.
- Database rollback: add a forward reverting migration.
- Configuration repair: correct the source value and rerun bootstrap/deploy.
- Provider repair: run **Configure Providers** in plan/apply/verify mode.
