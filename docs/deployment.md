# Deployment

## Normal operator path

Use one command from a trusted authenticated shell:

```bash
npm run bootstrap:all -- --apply
```

Or run **Bootstrap & Deploy** once from GitHub Actions.

The aggregate operation performs:

```text
full application + Playwright checks
→ Terraform state convergence
→ shared platform convergence
→ development bootstrap, deployment, and verification
→ production bootstrap, deployment, and verification
```

When `target=all`, production cannot begin until development verification succeeds. Production environment approval remains the intentional human gate.

## Reusable pipeline components

The aggregate workflow calls the existing components instead of duplicating their behavior:

- **App checks** — lint, typecheck, tests, build, and optional Playwright E2E.
- **Terraform State Bootstrap** — default `converge` mode plus recovery-only `reconcile`, `plan`, and exact-artifact `apply` modes.
- **Terraform Platform** — default `converge` mode plus recovery-only granular modes.
- **Bootstrap Environment** — targeted provider/runtime/database `apply` or non-mutating `verify`.
- **Deploy** — migration validation/push, runtime reconciliation, immutable Vercel deployment reuse, and health checks.

Application checks run once in the aggregate workflow. Deployments receive `skip_app_checks=true` so development and production do not repeat the same source validation.

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

## Development topology

Only the `develop` integration branch automatically triggers the standalone development deployment workflow. The aggregate workflow is dispatched from `main`; bootstrap configuration explicitly permits `main` for both GitHub Environments.

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
- Configuration repair: correct the GitHub source value and rerun the aggregate workflow.
- Provider repair: run **Configure Providers**, then rerun **Bootstrap & Deploy**.
