# Deployment

## Normal operator path

Bootstrap and deploy development from a trusted authenticated shell:

```bash
npm run bootstrap -- --apply
```

Production must be requested explicitly:

```bash
npm run bootstrap -- --apply --target=production
```

The same operation is available as **Bootstrap & Deploy** in GitHub Actions, where `development` is the default and `production` is the only alternative.

The selected environment follows one linear pipeline:

```text
full application + Playwright checks
→ Terraform state convergence
→ shared platform convergence
→ environment bootstrap
→ deployment
→ non-mutating verification
```

## Reusable pipeline components

The workflow calls existing components instead of duplicating their behavior:

- **App checks** — lint, typecheck, tests, build, and Playwright E2E.
- **Terraform State Bootstrap** — default `converge` mode plus recovery-only `reconcile`, `plan`, and exact-artifact `apply` modes.
- **Terraform Platform** — default `converge` mode plus recovery-only granular modes.
- **Bootstrap Environment** — provider/runtime/database `apply` or non-mutating `verify`.
- **Deploy** — migration validation/push, runtime reconciliation, immutable Vercel deployment reuse, and health checks.

Application checks run once. Deployment receives `skip_app_checks=true` so the same source validation is not repeated.

## Safety and idempotency

- Source checks must pass before infrastructure mutation begins.
- Shared Terraform workflows use one global infrastructure lock.
- Hosted runtime mutation uses per-environment locks.
- Automatic convergence creates a binary Terraform plan and applies that exact plan in the same protected run.
- First-run state is migrated automatically into the newly created GCS backend.
- Existing provider resources are adopted before platform planning.
- Provider lockfiles are committed and enforced read-only.
- Vercel environment writes are skipped when keyed fingerprints match.
- Identical source/runtime fingerprints reuse an existing ready deployment.
- Stripe desired metadata and events come from one shared implementation.
- Supabase migrations remain forward-only and safe to rerun.
- Production refuses to deploy with Terraform, provider, or runtime drift.
- Final verification is non-mutating and includes deployed health checks.

## Environment topology

Only the `develop` integration branch automatically triggers the standalone development deployment workflow. The hosted bootstrap workflow is dispatched from `main`; the target-aware GitHub setup permits `main` for the selected Environment. Production also retains its `v*` deployment policy.

## Diagnostics and recovery

Application check output is retained as short-lived artifacts for lint, typecheck, test, build, and E2E failures.

Use granular workflows only when diagnosing or recovering a specific layer:

- Terraform `reconcile` to adopt resources.
- Terraform `plan` and exact-artifact `apply` for exceptional reviewed changes.
- Bootstrap Environment `verify` for non-mutating drift diagnosis.
- Configure Providers for provider-only repair.
- Standalone deploy workflows for application-only releases.

## Rollback

- Vercel application rollback: promote a previous immutable deployment.
- Database rollback: add a forward reverting migration.
- Configuration repair: correct the selected GitHub Environment value and rerun bootstrap.
- Provider repair: run **Configure Providers**, then rerun **Bootstrap & Deploy** for that target.
