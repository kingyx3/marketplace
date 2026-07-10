# Provisioning and infrastructure as code

## Ownership

| Layer | Owner |
| --- | --- |
| GCS Terraform state bucket | `infra/terraform/bootstrap` |
| Shared Vercel project and hosted Supabase project shells | `infra/terraform/platform` |
| Provider/runtime reconciliation | `scripts/reconcile-runtime-environment.mjs` and provider libraries |
| Vercel runtime values | generated contract + `scripts/sync-vercel-env.mjs` |
| Database schema/storage/RLS/RPCs | Supabase migrations |
| Operator secrets and approval boundaries | GitHub Environments |

## Terraform lifecycle

Terraform core and provider versions are exact constraints. Dependabot proposes upgrades instead of bootstrap runs selecting newer versions implicitly.

Each Terraform workflow has three explicit modes:

- `reconcile`: the only mode allowed to import resources or remove confirmed stale state entries.
- `plan`: side-effect-free and uploads a one-day binary plan plus readable summary.
- `apply`: downloads and verifies the exact reviewed plan using `plan_run_id`.

The platform state reader treats only known missing-state messages as absence. Authentication, backend, lock, and provider errors fail closed.

## Provider reconciliation

Stripe uses one library for discovery, diffing, create/update/replacement, metadata, rollback, and verification. Google Auth reads current Supabase hosted auth configuration, applies only changed supported fields, and verifies enablement, site URL, and redirect allow-list.

## Dashboard-managed boundaries

- Provider account creation and billing.
- Google OAuth consent-screen/client ownership.
- Stripe account-level PayNow/branding/tax/compliance controls.
- GitHub credential entry when the trusted local bootstrap CLI is not used.
- Optional notification sender/domain verification.
