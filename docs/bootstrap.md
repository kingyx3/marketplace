# Bootstrap guide

The hosted bootstrap defaults to `development`. It converges one selected target through the **Bootstrap & Deploy** workflow on `main`. The normal application-release path is the separate **Deploy App** workflow.

Bootstrap is idempotent: unchanged GitHub settings, infrastructure, provider configuration, runtime values, migrations, and deployments become no-ops or reuse existing ready resources.

## Source of truth

- `package.json` — operator commands.
- `scripts/bootstrap-hosted.mjs` — target selection, plan/apply behavior, dispatch, and run following.
- `scripts/configure-github-governance.mjs` — `main` branch protection.
- `scripts/bootstrap-github.mjs` — GitHub Environment policies and trusted-shell value intake.
- `.github/workflows/bootstrap.yml` — full-stack convergence orchestration.
- `.github/workflows/deploy-app.yml` — branch, tag, release, and manual app deployment routing.
- `config/environment-contract.json` — runtime and deployment environment contract.
- `infra/terraform/platform` — hosted Vercel and Supabase topology.

## External prerequisites

Repository code cannot create every account-level trust boundary. Confirm:

- GitHub repository administration and an authenticated `gh` CLI session.
- Node and npm versions accepted by `package.json`.
- A Google Cloud project and credential allowed to manage the Terraform state bucket.
- A Vercel API token.
- A Supabase access token and organization access.
- Stripe test/live keys with PayNow enabled at the account level.
- Google OAuth consent-screen and Web-client ownership when Google Auth is enabled.
- A Sentry organization/project plus a least-privilege release/source-map auth token for staging and production.
- Verified Resend sender/domain and operational alert destinations for hosted release gates.

Run bootstrap from this repository checkout; the command resolves the target repository through `gh repo view`.

## Trusted-shell values

Bootstrap reads values from the current shell and writes them to repository or Environment settings without printing secret contents.

### Shared repository settings

| Shell input | GitHub setting | Requirement |
| --- | --- | --- |
| `GCP_TERRAFORM_CREDENTIALS_JSON` | Repository secret | Required |
| `VERCEL_TOKEN` | Repository secret | Required |
| `SUPABASE_ACCESS_TOKEN` | Repository secret | Required |
| `SENTRY_ORG` | Repository variable | Required for staging/production source maps |
| `SENTRY_PROJECT` | Repository variable | Required for staging/production source maps |
| `SENTRY_AUTH_TOKEN` | Repository secret | Required for staging/production source maps |

`SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` are shared build settings, not per-environment application configuration. The organization and project slugs are non-secret identifiers. The auth token must be scoped only to the release/source-map permissions required by the build.

Optional shared Terraform overrides are repository variables: `ENABLE_RELEASE_TOPOLOGY`, `GCP_PROJECT_ID`, `PROJECT_SLUG`, `TF_STATE_BUCKET_NAME`, `TF_STATE_BUCKET_LOCATION`, `SUPABASE_ORGANIZATION_ID`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_ROOT_DIRECTORY`, and `SUPABASE_REGION`.

`ENABLE_RELEASE_TOPOLOGY` defaults to `false`. Set it to `true` only when provisioning dedicated staging and recovery resources.

### Target-prefixed values

Prefix values with `DEVELOPMENT_`, `STAGING_`, or `PRODUCTION_`. Bootstrap removes the target prefix before writing the selected GitHub Environment.

Common values:

| Suffix | GitHub setting | Requirement |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Environment variable | Required |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Environment variable | Required |
| `NEXT_PUBLIC_SENTRY_DSN` | Environment variable | Optional in development; required for staging/production |
| `GOOGLE_AUTH_ENABLED` | Environment variable | Defaults to `true` |
| `GOOGLE_OAUTH_CLIENT_ID` | Environment variable | Required when Google Auth is enabled |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Environment secret | Required when Google Auth is enabled |
| `STRIPE_SECRET_KEY` | Environment secret | Required |
| `RESEND_FROM_EMAIL` | Environment variable | Required |
| `SUPPORT_EMAIL` | Environment variable | Optional |
| `SUPABASE_SECRET_KEY` | Environment secret | Optional fallback |
| `STRIPE_WEBHOOK_SECRET` | Environment secret | Optional recovery override |
| `CRON_SECRET` | Environment secret | Required for staging/production |
| `SYNTHETIC_MONITOR_SECRET` | Environment secret | Required for staging/production |
| `OPERATIONAL_ALERT_WEBHOOK_URL` | Environment secret | Required for staging/production |
| `OPERATIONAL_ALERT_WEBHOOK_SECRET` | Environment secret | Required for staging/production |
| `RESEND_API_KEY` | Environment secret | Required for staging/production |

The DSN is the only Sentry runtime value that must be stored per environment, and it is not a credential. Environment naming, release identification, trace sampling, and replay sampling use safe code defaults and Vercel metadata. Bootstrap removes redundant environment-scoped Sentry build settings so repository-level values cannot be accidentally shadowed.

Staging release-gate values:

| Shell input | Stored setting |
| --- | --- |
| `STAGING_RECOVERY_PROJECT_REF` | Environment variable `RECOVERY_PROJECT_REF` |
| `STAGING_STAGING_DATABASE_URL` | Environment secret `STAGING_DATABASE_URL` |
| `STAGING_RECOVERY_DATABASE_URL` | Environment secret `RECOVERY_DATABASE_URL` |
| `STAGING_OPERATIONS_OWNER` | Environment variable `OPERATIONS_OWNER` |
| `STAGING_INCIDENT_ESCALATION_URL` | Environment variable `INCIDENT_ESCALATION_URL` |
| `STAGING_RESTORE_RTO_SECONDS` | Environment variable `RESTORE_RTO_SECONDS` |
| `STAGING_CHECKOUT_AVAILABILITY_SLO_PERCENT` | Environment variable |
| `STAGING_CHECKOUT_LATENCY_SLO_MS` | Environment variable |
| `STAGING_PAYMENT_RECONCILIATION_SLO_MINUTES` | Environment variable |

Production values include `PRODUCTION_OPERATIONS_OWNER`, `PRODUCTION_INCIDENT_ESCALATION_URL`, `PRODUCTION_SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS`, `PRODUCTION_SUPABASE_ADVISOR_ALLOWLIST`, and the production SLO variables.

Set `PRODUCTION_REVIEWERS=user1,user2` only when creating or changing required production reviewers. It is bootstrap input and is not stored as a secret or variable.

## Preview and apply

Preview development GitHub changes without mutation:

```bash
npm run bootstrap
```

Preview another target:

```bash
npm run bootstrap -- --target=production
```

Apply development bootstrap:

```bash
npm run bootstrap -- --apply
```

Apply production provisioning or full recovery convergence:

```bash
npm run bootstrap -- --apply --target=production
```

Apply staging after enabling the extended topology:

```bash
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap -- --apply --target=staging
```

Without `--apply`, no GitHub settings are changed and no hosted workflow is dispatched. With `--apply`, the command reconciles governance and the selected Environment, dispatches `.github/workflows/bootstrap.yml` from `main`, follows that exact run, and returns its exit status. Unmerged local changes are not included.

## Bootstrap & Deploy sequence

```text
validate target availability
→ full application and Playwright checks
→ converge Terraform state bucket
→ converge shared platform infrastructure
→ reconcile selected provider/runtime/database state
→ deploy or reuse the identical application revision
→ verify without mutation
→ assert every stage succeeded
```

The internal workflows are reusable-only and prefixed `ZZZ-`. They are implementation details of the two orchestration flows, not separate operator entry points.

## Hosted topology

Default compact topology:

- `development`: Vercel Preview deployments in the primary project plus the development Supabase project.
- `production`: Vercel Production in the primary project plus the production Supabase project.

Extended topology with `ENABLE_RELEASE_TOPOLOGY=true`:

- `staging`: dedicated staging Vercel and Supabase projects.
- `recovery`: Supabase project used only by restore verification.
- `production`: gated staging-to-production releases through **Deploy App**.

Enabling the extended topology later adds staging and recovery resources without changing development or production Terraform addresses.

## Convergence guarantees

- State bootstrap detects first-run local state versus the persistent GCS backend and migrates state automatically.
- Existing state buckets and provider resources are safely adopted before planning.
- Terraform creates and applies the exact binary plan in the same protected run.
- Shared infrastructure uses one global concurrency lock and committed read-only provider lockfiles.
- Stripe webhook configuration uses one desired-state implementation.
- Supabase Google Auth, site URL, redirects, and migrations are reconciled through the environment bootstrap.
- The environment DSN and shared Sentry source-map build settings are reconciled through the same protected path.
- Vercel runtime values are fingerprinted; unchanged values are not rewritten.
- Identical source/runtime fingerprints reuse an existing ready deployment.
- Staging and production fail closed on infrastructure, provider, or runtime drift.
- Final verification is non-mutating and includes hosted health/readiness checks.

## Recovery

Rerun **Bootstrap & Deploy** for the affected target. This is the supported convergence and recovery path.

Use **Configure Providers (recovery)** only as a break-glass provider-only diagnostic or repair workflow, then rerun **Bootstrap & Deploy**. Application-only retries use **Deploy App**.

Never edit an applied migration; add a forward migration. Correct operator values at their GitHub source and rerun the appropriate orchestrator. See `docs/observability.md` for Sentry smoke tests, privacy controls, and production alerting requirements.
