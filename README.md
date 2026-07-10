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

## Hosted bootstrap

After exporting the trusted provider/account values documented in [`docs/bootstrap.md`](docs/bootstrap.md), bootstrap development with one command:

```bash
npm run bootstrap -- --apply
```

That command reconciles GitHub governance and the development Environment, runs the full CI suite, converges shared infrastructure, then bootstraps, deploys, and verifies development. It follows the Actions run and exits unsuccessfully if any stage fails.

Production is retained as an explicit operation:

```bash
npm run bootstrap -- --apply --target=production
```

Without `--apply`, the command is plan-only and does not dispatch anything. The same development-default operation is available through **Bootstrap & Deploy** in GitHub Actions.

The granular Terraform, provider, environment-bootstrap, and deployment workflows remain available for recovery and diagnostics, but they are not the normal operator path.

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

- [`docs/bootstrap.md`](docs/bootstrap.md) — one-command hosted setup, production option, and rerun guarantees
- [`docs/environments.md`](docs/environments.md) — configuration sources and GitHub intake
- [`docs/generated/environment-reference.md`](docs/generated/environment-reference.md) — generated environment contract
- [`docs/deployment.md`](docs/deployment.md) — CI/CD and release behavior
- [`docs/provisioning.md`](docs/provisioning.md) — Terraform/provider ownership
- [`docs/local-dev.md`](docs/local-dev.md) — local development
- [`docs/security.md`](docs/security.md) — RLS, secrets, webhooks
- [`docs/build-plan.md`](docs/build-plan.md) — implemented and remaining product work
