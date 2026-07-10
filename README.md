# Marketplace

Sealed TCG booster-box distribution for B2C retail, B2B wholesale, and pre-orders. The application is Next.js with Supabase, Stripe PayNow, Vercel, Terraform, and GitHub Actions.

## Local quickstart

```bash
nvm use
npm run bootstrap:doctor
npm run bootstrap:local
# add Stripe test values to .env.local when reported as missing
npm run dev
```

`bootstrap:local` installs locked npm dependencies, starts the pinned Supabase CLI stack, derives local Supabase values, writes `.env.local` without overwriting existing provider credentials, resets migrations/seed data, and reports only the remaining unavoidable provider inputs.

## Hosted bootstrap and release

After exporting the trusted provider/account values documented in [`docs/bootstrap.md`](docs/bootstrap.md), run one command:

```bash
npm run bootstrap:all -- --apply
```

That command:

1. Reconciles GitHub branch governance, environments, deployment policies, variables, secrets, and production reviewers.
2. Dispatches the **Bootstrap & Deploy** workflow.
3. Runs the complete CI suite once.
4. Converges the Terraform state bucket and shared Vercel/Supabase platform.
5. Bootstraps, deploys, and verifies development.
6. Bootstraps, deploys, and verifies production.
7. Follows the Actions run and exits unsuccessfully if any stage fails.

Use `--target=development` or `--target=production` to limit the scope. Without `--apply`, the command is plan-only and does not dispatch anything.

The same operation can be started from GitHub Actions by running **Bootstrap & Deploy** once. Production environment approval remains an intentional human trust boundary; no other workflow sequence needs to be assembled manually.

The granular Terraform, provider, bootstrap, and deployment workflows remain available for recovery and diagnostics, but they are not the normal operator path.

## Checks

```bash
npm run config:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Pull-request CI also initializes and validates both Terraform stacks and verifies committed multi-platform provider lockfiles.

## Documentation

- [`docs/bootstrap.md`](docs/bootstrap.md) — one-command hosted setup, release gate, and rerun guarantees
- [`docs/environments.md`](docs/environments.md) — configuration sources and GitHub intake
- [`docs/generated/environment-reference.md`](docs/generated/environment-reference.md) — generated environment contract
- [`docs/deployment.md`](docs/deployment.md) — CI/CD and release behavior
- [`docs/provisioning.md`](docs/provisioning.md) — Terraform/provider ownership
- [`docs/local-dev.md`](docs/local-dev.md) — local development
- [`docs/security.md`](docs/security.md) — RLS, secrets, webhooks
- [`docs/build-plan.md`](docs/build-plan.md) — implemented and remaining product work
