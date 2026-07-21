# Provisioning and infrastructure as code

## Ownership

| Layer                                                                            | Owner                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GCS Terraform state bucket                                                       | `infra/terraform/bootstrap`                                        |
| Primary and optional staging Vercel projects plus hosted Supabase project shells | `infra/terraform/platform`                                         |
| Provider/runtime reconciliation                                                  | `scripts/reconcile-runtime-environment.mjs` and provider libraries |
| Vercel runtime values                                                            | generated contract + `scripts/sync-vercel-env.mjs`                 |
| Database schema/storage/RLS/RPCs                                                 | Supabase migrations                                                |
| Operator secrets, release evidence, and approval boundaries                      | GitHub Environments and Actions                                    |

## Normal provisioning path

`npm run bootstrap -- --apply` defaults to development and owns the normal end-to-end lifecycle: GitHub intake, checks, Terraform convergence, provider/runtime reconciliation, migrations, deployment, and verification.

Production uses the same full-stack path when selected explicitly:

```bash
npm run bootstrap -- --apply --target=production
```

Staging is available only after opting into the extended release topology:

```bash
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap -- --apply --target=staging
```

The command dispatches the hosted workflow from `main`. When the extended release topology and its readiness inputs are configured, routine production application releases should use a published release or `v*` tag so the exact revision is deployed to staging and must pass hosted release gates before production. Direct production bootstrap remains the deliberate path for initial provisioning and full-stack recovery.

## Managed topology

The default compact topology manages:

- one primary Vercel project used by development and production;
- Supabase projects for `development` and `production`.

Set the repository variable `ENABLE_RELEASE_TOPOLOGY=true` to additionally manage:

- one dedicated staging Vercel project;
- Supabase projects for `staging` and `recovery`.

`recovery` supports restore verification and is not a deploy/bootstrap target. Terraform outputs map deployable environments to the correct Vercel project and every active hosted data environment to its Supabase project, URL, and generated database password.

## Terraform lifecycle

Terraform core and provider versions are exact constraints. Dependabot proposes upgrades instead of bootstrap runs selecting newer versions implicitly.

Each Terraform workflow has four modes:

- `converge`: the normal automatic path; adopts known resources, creates a binary plan, and applies that exact plan in the same protected run.
- `reconcile`: imports resources or removes confirmed stale state entries for recovery.
- `plan`: side-effect-free and uploads a one-day binary plan plus readable summary.
- `apply`: downloads and verifies the exact reviewed plan using `plan_run_id`.

The platform state reader treats only known missing-state messages as absence. Authentication, backend, lock, and provider errors fail closed.

The state bootstrap starts with local state because the GCS backend bucket may not exist yet. The workflow migrates that state to the persistent backend after the bucket converges.

## Provider reconciliation

HitPay uses one library for discovery, diffing, create/update/replacement, metadata, rollback, and verification. Google Auth reads current Supabase hosted auth configuration, applies only changed supported fields, and verifies enablement, site URL, and redirect allow-list.

Vercel values are reconciled per environment and skipped when keyed fingerprints match. Supabase project keys and database topology are resolved from Terraform and provider APIs rather than copied into committed configuration.

## Dashboard-managed boundaries

- Provider account creation, organization membership, billing, and plan selection.
- Google OAuth consent-screen/client ownership and external redirect registration.
- HitPay account-level PayNow, branding, tax, and compliance controls.
- GitHub credential entry when the trusted local bootstrap CLI is not used.
- Resend sender/domain verification and external alert endpoint ownership.
- Supabase compute sizing until the pinned provider exposes a tested stable resource argument.
