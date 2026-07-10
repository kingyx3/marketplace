# Bootstrap guide

The normal hosted setup is one command or one GitHub Actions run. It is safe to rerun: unchanged infrastructure, provider configuration, runtime values, migrations, and deployments converge to no-ops.

## External prerequisites

Create or confirm the account-level trust boundaries that repository code cannot own:

- GitHub repository administration and an authenticated `gh` CLI session.
- A Google Cloud project and credential allowed to manage the Terraform state bucket.
- A Vercel API token.
- A Supabase access token.
- Stripe test/live keys with PayNow enabled at the account level.
- Google OAuth consent-screen and Web-client ownership when Google Auth is enabled.

## Required trusted-shell values

Shared values use their normal names:

```text
GCP_TERRAFORM_CREDENTIALS_JSON
VERCEL_TOKEN
SUPABASE_ACCESS_TOKEN
```

Per-environment values use `DEVELOPMENT_` or `PRODUCTION_` prefixes:

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

## One-command path

Preview the GitHub changes without mutating anything:

```bash
npm run bootstrap:all
```

Apply everything and follow the resulting Actions run until completion:

```bash
npm run bootstrap:all -- --apply
```

Optional scopes:

```bash
npm run bootstrap:all -- --apply --target=development
npm run bootstrap:all -- --apply --target=production
```

The command performs two operations:

1. Reconciles GitHub branch governance, environments, deployment policies, variables, supplied secrets, and production reviewers.
2. Dispatches **Bootstrap & Deploy**, discovers that exact workflow run, follows it, and returns its exit status.

The workflow then performs:

```text
full application and E2E checks
→ converge Terraform state bucket
→ adopt/converge shared Vercel and Supabase infrastructure
→ bootstrap development providers, runtime values, and database
→ deploy and verify development
→ bootstrap production providers, runtime values, and database
→ deploy and verify production
```

Choosing `all` deliberately requires development to pass before production begins. Production environment approval remains an intentional human gate, but no workflow sequence needs to be assembled manually.

## GitHub Actions path

After GitHub variables and secrets already exist, run **Bootstrap & Deploy** once from the Actions tab and choose `all`, `development`, or `production`.

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

- Application checks run once in the parent workflow and are not repeated inside each deployment.
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

Use recovery mode when adopting manually created resources, diagnosing state, or repairing one environment. Otherwise rerun **Bootstrap & Deploy**.

## Operational rules

- Never edit an applied migration; add a forward migration.
- Correct operator values at their GitHub source and rerun the one-click workflow.
- Keep Google OAuth redirect registration and Stripe PayNow/account compliance settings aligned with the documented provider-account prerequisites.
- Treat any failed stage as a failed bootstrap; the command and aggregate workflow both exit unsuccessfully.
