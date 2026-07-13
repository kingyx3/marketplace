# Deployment

## Full-stack bootstrap

From a trusted authenticated shell, bootstrap development from `main`:

```bash
npm run bootstrap -- --apply
```

Production is always available as an explicit target:

```bash
npm run bootstrap -- --apply --target=production
```

Staging is an explicit target only after opting into the extended release topology:

```bash
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap -- --apply --target=staging
```

The same operation is available as **Bootstrap & Deploy** in GitHub Actions. `development` is the default and `production` is always available; selecting `staging` fails closed unless the repository variable `ENABLE_RELEASE_TOPOLOGY=true` is set.

The local command reconciles GitHub governance and the selected Environment before dispatching `.github/workflows/bootstrap.yml` with `--ref main`. Feature-branch or unmerged local changes are not included.

The selected environment follows one linear pipeline:

```text
full application + Playwright checks
→ Terraform state convergence
→ platform convergence
→ environment provider/runtime/database bootstrap
→ deployment
→ non-mutating verification
→ final all-stage success assertion
```

## Normal release paths

The standalone release workflows use the reusable deployment pipeline:

- Pushes to `develop` deploy `development` unless the change is documentation-only.
- Pushes to `main` deploy `staging` only when the extended release topology is enabled; otherwise the staging workflow fails closed during environment resolution.
- A published GitHub release or `v*` tag runs **Deploy production**, which requires the extended release topology and configured staging/recovery readiness inputs.

The production release workflow does not deploy production immediately. It:

1. Deploys the exact release revision to staging.
2. Runs hosted release gates against that immutable staging deployment.
3. Verifies production Supabase backup/recovery and advisor readiness.
4. Requests the production GitHub Environment approval when configured.
5. Deploys the same revision to production only after the gates succeed.

Hosted release evidence covers real Supabase Auth/RLS/storage behavior, Google OAuth redirects, Stripe test-mode payments/webhooks/refunds, delivered email, deep operational readiness, alerting/SLO ownership, and a timed restore drill. Evidence artifacts are retained by the workflow.

Direct `--target=production` bootstrap remains available for initial provisioning and full-stack recovery. After the extended topology is enabled, routine application releases should use the tag/release path so staging evidence is tied to the exact production revision.

## Reusable pipeline components

The workflows call existing components instead of duplicating behavior:

- **App checks** — lint, typecheck, tests, build, and Playwright E2E.
- **Terraform State Bootstrap** — default `converge` mode plus recovery-only `reconcile`, `plan`, and exact-artifact `apply` modes.
- **Terraform Platform** — default `converge` mode plus recovery-only granular modes.
- **Bootstrap Environment** — provider/runtime/database `apply` or non-mutating `verify`.
- **Deploy** — environment validation, migration validation/push, runtime reconciliation, immutable Vercel deployment reuse, and health checks.
- **Hosted release gates** — credentialed staging and production evidence required before routine production deployment.

Application checks run once in **Bootstrap & Deploy**. Deployment receives `skip_app_checks=true` so source validation is not repeated.

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
- Staging and production refuse to deploy with Terraform, provider, or runtime drift.
- Final verification is non-mutating and includes deployed health checks; staging and production also run deep readiness.

## Environment topology

The default compact topology has two deployable targets:

- `development`: primary Vercel project plus development Supabase project; integration branch is `develop`.
- `production`: primary Vercel project production target plus production Supabase project; direct bootstrap supports provisioning/recovery.

Set `ENABLE_RELEASE_TOPOLOGY=true` to add the release topology:

- `staging`: dedicated staging Vercel project plus staging Supabase project; `main` is the automatic release branch.
- `recovery`: Supabase project used by hosted restore verification, not a deploy target.
- `production`: `v*` tags and published releases trigger the gated staging-to-production path.

Target-aware GitHub setup permits `develop` and `main` for development, and `main` and `v*` for staging and production. Staging policies are created only when the extended topology is selected.

## Diagnostics and recovery

Application check output is retained as short-lived artifacts for lint, typecheck, test, build, and E2E failures. Hosted production-release evidence uses longer retention in the release-gate workflow.

Use granular workflows only when diagnosing or recovering a specific layer:

- Terraform `reconcile` to adopt resources.
- Terraform `plan` and exact-artifact `apply` for exceptional reviewed changes.
- Bootstrap Environment `verify` for non-mutating drift diagnosis.
- Configure Providers for provider-only repair.
- Standalone development deployment, plus staging deployment when the extended topology is enabled, for application-only releases.
- Direct production bootstrap for initial provisioning or full-stack recovery, not routine release promotion.

## Rollback

- Vercel application rollback: promote a previous immutable deployment.
- Database rollback: add a forward reverting migration.
- Configuration repair: correct the selected GitHub Environment value and rerun bootstrap or deployment.
- Provider repair: run **Configure Providers**, then rerun **Bootstrap & Deploy** for that target.
