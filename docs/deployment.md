# Deployment

The repository has two primary deployment orchestration workflows:

1. **Bootstrap & Deploy** — manually converges all required resources, providers, runtime configuration, database state, application deployment, and final verification for one target.
2. **Deploy App** — deploys application changes through the normal branch, tag, release, or manual path without rebuilding infrastructure.

`CI` remains independent because pull-request validation must run without deployment credentials. **Configure Providers (recovery)** remains a manual break-glass workflow for provider-only diagnosis or repair. Every other deployment workflow is a reusable helper prefixed with `ZZZ-` and is not directly dispatchable.

## Full-stack bootstrap

From a trusted authenticated shell, bootstrap development from `main`:

```bash
npm run bootstrap -- --apply
```

Production is available as an explicit provisioning or recovery target:

```bash
npm run bootstrap -- --apply --target=production
```

Staging is available only after opting into the extended release topology:

```bash
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap -- --apply --target=staging
```

The same operation is available as **Bootstrap & Deploy** in GitHub Actions. `development` is the default. The workflow runs one linear idempotent pipeline:

```text
application + Playwright checks
→ Terraform state convergence
→ platform convergence
→ provider/runtime/database convergence
→ deployment or identical-deployment reuse
→ non-mutating verification
→ final all-stage success assertion
```

Repeated runs converge existing resources, adopt safe pre-existing provider resources, skip unchanged runtime values, apply only the generated Terraform plans, push forward-only migrations, and reuse a ready Vercel deployment when source and runtime fingerprints match.

## Application deployment

**Deploy App** is the single application-release entry point:

- Pushes to any non-`main` branch deploy `development`, except documentation-only changes.
- Pushes to `main` deploy `staging` only when `ENABLE_RELEASE_TOPOLOGY=true`; while staging is not provisioned, the workflow records a deliberate no-deploy result instead of resolving another environment.
- A published GitHub release or `v*` tag deploys with the `production` GitHub Environment. With the extended release topology enabled, it first runs the gated staging path; otherwise it deploys directly to production.
- Manual dispatch can select `development` or `production` at any time. Selecting `staging` fails closed until the extended topology is enabled and bootstrapped.

Development deployment skips a superseded branch revision. Missing hosted credentials fail closed in the shared deployment helper. All target deployments are serialized and use the same reusable environment deployment pipeline.

A production release always resolves runtime values and secrets from the `production` GitHub Environment. When the extended release topology is enabled, it:

1. Deploys the exact release revision to staging.
2. Runs hosted identity, payment, notification, recovery, SLO, and provider-readiness evidence against that immutable staging deployment.
3. Requests production Environment approval when configured.
4. Deploys the same revision to production only after the gates succeed.

Until staging exists, the release instead runs the complete shared deployment checks directly against the protected production target. It never substitutes development or a missing staging environment for production credentials.

The app deployment helper validates environment and Terraform outputs, checks migrations transactionally, pushes hosted migrations, reconciles provider/runtime state, deploys or reuses the identical Vercel revision, and performs health checks. Staging and production fail closed on infrastructure or provider drift.

## Reusable helpers

The orchestrators compose these internal workflows:

- `ZZZ-App checks (reusable)` — lint, typecheck, tests, build, and optional Playwright E2E.
- `ZZZ-Terraform State Bootstrap` — first-run state-bucket creation, safe adoption, exact-plan application, and backend migration.
- `ZZZ-Terraform Platform` — safe provider-resource adoption followed by exact-plan platform convergence.
- `ZZZ-Bootstrap Environment` — provider/runtime/database apply or non-mutating verification.
- `ZZZ-Deploy (reusable)` — target validation, migrations, runtime reconciliation, deployment reuse, and health checks.
- `ZZZ-Hosted Release Gates` — staging and production evidence required before routine production deployment.

These helpers expose `workflow_call` only. Operators should use **Bootstrap & Deploy** or **Deploy App**, not invoke implementation layers separately.

## Safety and idempotency

- Shared Terraform mutation uses one global lock.
- Bootstrap and app deployment runs are serialized by target/ref and are never canceled mid-mutation.
- Terraform creates a binary plan and applies that exact plan in the same protected run.
- First-run local bootstrap state migrates into the newly created GCS backend.
- Existing provider resources are adopted before platform planning.
- Provider lockfiles are committed and initialized read-only.
- Vercel environment writes are skipped when keyed fingerprints match.
- Identical source/runtime fingerprints reuse an existing ready deployment.
- Supabase migrations are forward-only and validated transactionally before hosted push.
- Staging and production refuse to deploy with Terraform, provider, or runtime drift.
- Final bootstrap verification is non-mutating.

## Recovery

Normal recovery is to rerun **Bootstrap & Deploy** for the affected target. Use **Configure Providers (recovery)** only when isolating provider configuration is necessary before rerunning bootstrap.

- Vercel rollback: promote a previous immutable deployment.
- Database rollback: add a forward reverting migration.
- Configuration repair: correct the selected GitHub Environment value and rerun bootstrap or deployment.
- Provider repair: run **Configure Providers (recovery)**, then rerun **Bootstrap & Deploy**.
