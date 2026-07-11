# Bootstrap guide

The hosted bootstrap supports `development`, `staging`, and `production`. `development` is the default. The local command first reconciles GitHub governance and the selected GitHub Environment, then—only with `--apply`—dispatches **Bootstrap & Deploy** from the `main` branch and follows that exact workflow run to completion.

Bootstrap is convergent: unchanged branch protection, environments, infrastructure, provider settings, runtime values, migrations, and deployments become no-ops or reuse existing ready resources.

## Source-of-truth map

When this guide and implementation differ, update the guide against these executable contracts:

- `package.json` — operator commands.
- `scripts/bootstrap-hosted.mjs` — target selection, plan/apply behavior, dispatch, and run following.
- `scripts/configure-github-governance.mjs` — `main` branch protection.
- `scripts/bootstrap-github.mjs` — GitHub Environment policies and shell-value intake.
- `.github/workflows/bootstrap.yml` — end-to-end workflow graph.
- `config/environment-contract.json` and `docs/generated/environment-reference.md` — runtime/deploy environment contract.
- `infra/terraform/platform` — hosted Vercel and Supabase topology.

## External prerequisites

Create or confirm the account-level trust boundaries repository code cannot own:

- GitHub repository administration and an authenticated `gh` CLI session.
- Node and npm versions accepted by `package.json`.
- A Google Cloud project and credential allowed to manage the Terraform state bucket.
- A Vercel API token.
- A Supabase access token and organization access.
- Stripe test/live keys with PayNow enabled at the account level.
- Google OAuth consent-screen and Web-client ownership when Google Auth is enabled.
- Verified Resend sender/domain and operational alert destinations for staging and production readiness gates.

The command always operates on the repository resolved by `gh repo view`. Run it from this repository checkout.

## Trusted-shell values

The bootstrap intake reads values from the current shell and writes them to repository secrets or the selected GitHub Environment without printing their contents.

### Shared repository values

These unprefixed values are required for every target and are stored as GitHub repository secrets:

| Shell input | GitHub setting |
| --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Repository secret |
| `VERCEL_TOKEN` | Repository secret |
| `SUPABASE_ACCESS_TOKEN` | Repository secret |

Optional Terraform overrides are stored as GitHub repository variables, not target-prefixed shell values: `GCP_PROJECT_ID`, `PROJECT_SLUG`, `TF_STATE_BUCKET_NAME`, `TF_STATE_BUCKET_LOCATION`, `SUPABASE_ORGANIZATION_ID`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_ROOT_DIRECTORY`, and `SUPABASE_REGION`.

### Target-prefixed values

Prefix environment values with `DEVELOPMENT_`, `STAGING_`, or `PRODUCTION_` to match `--target`. The bootstrap removes that shell prefix before storing the value in the selected GitHub Environment.

Common values for all targets:

| Suffix | GitHub setting | Requirement |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Environment variable | Required |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Environment variable | Required |
| `GOOGLE_AUTH_ENABLED` | Environment variable | Defaults to `true` when omitted |
| `GOOGLE_OAUTH_CLIENT_ID` | Environment variable | Required by strict resolution when Google Auth is enabled |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Environment secret | Required by strict resolution when Google Auth is enabled |
| `STRIPE_SECRET_KEY` | Environment secret | Required |
| `RESEND_FROM_EMAIL` | Environment variable | Required by GitHub intake |
| `SUPPORT_EMAIL` | Environment variable | Optional |
| `SUPABASE_SECRET_KEY` | Environment secret | Optional fallback when the Management API cannot return a modern server key |
| `STRIPE_WEBHOOK_SECRET` | Environment secret | Optional recovery override; normal bootstrap provisions and persists it transactionally |
| `CRON_SECRET` | Environment secret | Optional for development; required for staging and production |
| `SYNTHETIC_MONITOR_SECRET` | Environment secret | Optional for development; required for staging and production |
| `OPERATIONAL_ALERT_WEBHOOK_URL` | Environment secret | Optional for development; required for staging and production |
| `OPERATIONAL_ALERT_WEBHOOK_SECRET` | Environment secret | Optional for development; required for staging and production |
| `RESEND_API_KEY` | Environment secret | Optional for development; required for staging and production |

Staging-only values:

| Shell input | GitHub setting | Requirement |
| --- | --- | --- |
| `STAGING_RECOVERY_PROJECT_REF` | Environment variable `RECOVERY_PROJECT_REF` | Required |
| `STAGING_STAGING_DATABASE_URL` | Environment secret `STAGING_DATABASE_URL` | Required |
| `STAGING_RECOVERY_DATABASE_URL` | Environment secret `RECOVERY_DATABASE_URL` | Required |
| `STAGING_OPERATIONS_OWNER` | Environment variable `OPERATIONS_OWNER` | Required |
| `STAGING_INCIDENT_ESCALATION_URL` | Environment variable `INCIDENT_ESCALATION_URL` | Required |
| `STAGING_RESTORE_RTO_SECONDS` | Environment variable `RESTORE_RTO_SECONDS` | Defaults to `1800` |
| `STAGING_CHECKOUT_AVAILABILITY_SLO_PERCENT` | Environment variable `CHECKOUT_AVAILABILITY_SLO_PERCENT` | Defaults to `99.9` |
| `STAGING_CHECKOUT_LATENCY_SLO_MS` | Environment variable `CHECKOUT_LATENCY_SLO_MS` | Defaults to `5000` |
| `STAGING_PAYMENT_RECONCILIATION_SLO_MINUTES` | Environment variable `PAYMENT_RECONCILIATION_SLO_MINUTES` | Defaults to `15` |

`STAGING_STAGING_DATABASE_URL` is intentionally double-prefixed: the first `STAGING_` selects the GitHub Environment, while the stored secret is named `STAGING_DATABASE_URL`.

Production-only values:

| Shell input | GitHub setting | Requirement |
| --- | --- | --- |
| `PRODUCTION_OPERATIONS_OWNER` | Environment variable `OPERATIONS_OWNER` | Required |
| `PRODUCTION_INCIDENT_ESCALATION_URL` | Environment variable `INCIDENT_ESCALATION_URL` | Required |
| `PRODUCTION_SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS` | Environment variable `SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS` | Defaults to `7` |
| `PRODUCTION_SUPABASE_ADVISOR_ALLOWLIST` | Environment variable `SUPABASE_ADVISOR_ALLOWLIST` | Optional |
| `PRODUCTION_CHECKOUT_AVAILABILITY_SLO_PERCENT` | Environment variable `CHECKOUT_AVAILABILITY_SLO_PERCENT` | Defaults to `99.9` |
| `PRODUCTION_CHECKOUT_LATENCY_SLO_MS` | Environment variable `CHECKOUT_LATENCY_SLO_MS` | Defaults to `5000` |
| `PRODUCTION_PAYMENT_RECONCILIATION_SLO_MINUTES` | Environment variable `PAYMENT_RECONCILIATION_SLO_MINUTES` | Defaults to `15` |

Set `PRODUCTION_REVIEWERS=user1,user2` when creating the production GitHub Environment for the first time. This is bootstrap-only shell input used to configure required reviewers; it is not stored as a GitHub secret or variable. Existing required reviewers are preserved when that value is omitted on later runs.

## Plan before applying

Preview development GitHub governance and Environment changes without mutation:

```bash
npm run bootstrap
```

Preview another target:

```bash
npm run bootstrap -- --target=staging
npm run bootstrap -- --target=production
```

Without `--apply`, no GitHub settings are changed and no hosted workflow is dispatched.

## Apply bootstrap

Development:

```bash
npm run bootstrap -- --apply
```

Staging:

```bash
npm run bootstrap -- --apply --target=staging
```

Production bootstrap or full recovery convergence:

```bash
npm run bootstrap -- --apply --target=production
```

The command:

1. Reconciles `main` branch protection.
2. Creates or updates the selected GitHub Environment, deployment policies, variables, supplied secrets, and production reviewers when applicable.
3. Dispatches `.github/workflows/bootstrap.yml` with `--ref main` and the selected target.
4. Finds the newly dispatched run, follows it, and returns its exit status.

Because the workflow is dispatched from `main`, unmerged local or feature-branch changes are not bootstrapped. Merge the desired implementation and documentation before applying.

## Workflow sequence

**Bootstrap & Deploy** runs one linear target-aware pipeline:

```text
full application and Playwright checks
→ converge Terraform state bucket
→ converge shared platform infrastructure
→ reconcile selected environment providers, runtime values, and database
→ deploy selected environment
→ verify selected environment without mutation
→ assert every stage succeeded
```

Application checks run once. Deployment receives `skip_app_checks=true` from the parent workflow.

## Hosted topology

- `development` uses the primary Vercel project and the development Supabase project.
- `staging` uses a dedicated staging Vercel project and staging Supabase project, with production-like readiness checks.
- `production` uses the primary Vercel project and production Supabase project, protected by the production GitHub Environment.
- `recovery` is a Terraform-managed Supabase project used by restore and recovery verification; it is not a bootstrap target.

For routine production releases, publish a `v*` tag or GitHub release. **Deploy production** first deploys the exact revision to staging, runs hosted release gates, and only then deploys production. Direct production bootstrap remains available for initial provisioning and full-stack recovery.

## What convergence includes

### Terraform

- The state workflow detects first-run local state versus the persistent GCS backend.
- Existing buckets and provider projects are adopted when safe.
- Automatic convergence creates a binary plan and applies that exact plan in the same protected run.
- Granular `reconcile`, `plan`, and reviewed-artifact `apply` modes remain available for recovery and exceptional review workflows.
- Shared infrastructure uses one global concurrency lock and committed provider lockfiles.

### Runtime and providers

- Stripe webhook discovery, creation, replacement, metadata, event configuration, rollback, and verification share one implementation.
- Supabase hosted Google Auth, site URL, and redirect allow-list are reconciled when enabled.
- Vercel runtime values are compared by keyed fingerprints and unchanged values are not rewritten.
- Supabase migrations are forward-only.

### Deployment and verification

- Identical source/runtime fingerprints reuse an existing ready Vercel deployment.
- Staging and production validate infrastructure/provider readiness before migration and deployment.
- Final verification checks Terraform drift, provider state, Vercel runtime state, `/api/health`, and deep readiness for hosted non-development targets.

## Recovery workflows

The following workflows remain available but are not the normal full-stack setup path:

- **Terraform State Bootstrap** — `converge`, `reconcile`, `plan`, or reviewed-artifact `apply`.
- **Terraform Platform** — `converge`, `reconcile`, `plan`, or reviewed-artifact `apply`.
- **Bootstrap Environment** — targeted `apply` or non-mutating `verify`.
- **Configure Providers** — provider-only plan, repair, or verification.
- Development, staging, and production deployment workflows — application release paths.

Use recovery mode when adopting manually created resources, diagnosing state, or repairing one layer. Otherwise rerun **Bootstrap & Deploy** for the selected target.

## Operational rules

- Never edit an applied migration; add a forward migration.
- Correct operator values at their GitHub source and rerun bootstrap.
- Keep Google OAuth redirect registration, Resend sender verification, operational alert endpoints, and Stripe PayNow/account compliance aligned with provider-account prerequisites.
- Treat any failed stage as a failed bootstrap; both the command and workflow exit unsuccessfully.
