# Bootstrap guide

The normal hosted setup bootstraps development through one command or one GitHub Actions run. Production remains available only when explicitly selected. Unchanged infrastructure, provider configuration, runtime values, migrations, and deployments converge to no-ops.

## External prerequisites

Create or confirm the account-level trust boundaries that repository code cannot own:

- GitHub repository administration and an authenticated `gh` CLI session.
- A Google Cloud project and credential allowed to manage the Terraform state bucket.
- A Vercel API token.
- A Supabase access token.
- Stripe test/live keys with PayNow enabled at the account level.
- Google OAuth consent-screen and Web-client ownership when Google Auth is enabled.

## Trusted-shell values

Shared values use their normal names:

```text
GCP_TERRAFORM_CREDENTIALS_JSON
VERCEL_TOKEN
SUPABASE_ACCESS_TOKEN
```

Development values use the `DEVELOPMENT_` prefix. Production values are only needed for an explicit production run and use `PRODUCTION_`:

```text
DEVELOPMENT_NEXT_PUBLIC_SITE_URL
DEVELOPMENT_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
DEVELOPMENT_GOOGLE_AUTH_ENABLED
DEVELOPMENT_GOOGLE_OAUTH_CLIENT_ID
DEVELOPMENT_STRIPE_SECRET_KEY
DEVELOPMENT_GOOGLE_OAUTH_CLIENT_SECRET

PRODUCTION_NEXT_PUBLIC_SITE_URL
PRODUCTION_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
PRODUCTION_GOOGLE_AUTH_ENABLED
PRODUCTION_GOOGLE_OAUTH_CLIENT_ID
PRODUCTION_STRIPE_SECRET_KEY
PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET
```

Set `PRODUCTION_REVIEWERS=user1,user2` when creating production for the first time. `SUPABASE_SECRET_KEY` is optional when the Management API exposes a modern server key. `STRIPE_WEBHOOK_SECRET` is optional because bootstrap provisions and persists it transactionally.

## Development bootstrap — default

Preview the development GitHub changes without mutating anything:

```bash
npm run bootstrap
```

Apply development and follow the resulting Actions run until completion:

```bash
npm run bootstrap -- --apply
```

The command:

1. Reconciles repository governance plus the development GitHub Environment, policies, variables, and supplied secrets.
2. Dispatches **Bootstrap & Deploy** with `target=development`.
3. Follows that exact workflow run and returns its exit status.

The workflow performs:

```text
full application and E2E checks
→ converge Terraform state bucket
→ adopt/converge shared Vercel and Supabase infrastructure
→ bootstrap development providers, runtime values, and database
→ deploy development
→ verify development
```

## Production bootstrap — explicit

Production uses the same tested path but must be selected explicitly:

```bash
npm run bootstrap -- --apply --target=production
```

This command only requires and reconciles production-specific values. GitHub production reviewers and the existing production drift/readiness gates remain enforced.

## GitHub Actions path

Run **Bootstrap & Deploy** from the Actions tab. `development` is the default; `production` is the only other option.

## What convergence includes

### Terraform

- The state workflow automatically detects first-run local state versus the persistent GCS backend.
- Existing buckets and provider projects are adopted when safe.
- Each automatic convergence creates a binary plan and applies that exact plan in the same protected run.
- Granular `reconcile`, `plan`, and reviewed-artifact `apply` modes remain available for recovery and exceptional review workflows.
- Shared infrastructure uses one global concurrency lock and committed provider lockfiles.

### Runtime and providers

- Stripe webhook creation, replacement, metadata, event configuration, rollback, and verification share one implementation.
- Supabase hosted Google Auth, site URL, and redirect allow-list are reconciled when enabled.
- Vercel runtime values are compared by keyed fingerprints and unchanged values are not rewritten.
- Supabase migrations are pushed forward-only.

### Deployment and verification

- Application checks run once and are not repeated inside deployment.
- Identical source/runtime fingerprints reuse an existing ready Vercel deployment.
- Production deployment refuses to proceed with Terraform, provider, or runtime drift.
- Final verification checks provider state, Vercel runtime state, `/api/health`, and production deep readiness.

## Recovery workflows

The following workflows remain available but are not the normal setup path:

- **Terraform State Bootstrap** — `reconcile`, `plan`, or reviewed-artifact `apply`.
- **Terraform Platform** — `reconcile`, `plan`, or reviewed-artifact `apply`.
- **Bootstrap Environment** — targeted `apply` or non-mutating `verify`.
- **Configure Providers** — provider-only plan, repair, or verification.
- Development and production deployment workflows — application-only deployment triggers.

Use recovery mode when adopting manually created resources, diagnosing state, or repairing one environment. Otherwise rerun **Bootstrap & Deploy** for the selected target.

## Operational rules

- Never edit an applied migration; add a forward migration.
- Correct operator values at their GitHub source and rerun bootstrap.
- Keep Google OAuth redirect registration and Stripe PayNow/account compliance settings aligned with the documented provider-account prerequisites.
- Treat any failed stage as a failed bootstrap; both the command and workflow exit unsuccessfully.
