# Marketplace

A retail marketplace for sealed trading-card products, limited-time deals, preorders, orders, and stock alerts. The application uses Next.js, Supabase, Stripe, Vercel, Terraform, and GitHub Actions.

## Product structure

- `/products` — products, filters, stock, preorders, and eligible sale prices
- `/cart` — retail checkout with server-verified totals and shipping
- `/account`, `/orders`, `/preorders` — authenticated customer activity
- `/control` — unlinked, role-scoped operations console for authorized administrators

The storefront does not advertise or link to the console.

## Local quickstart

```bash
nvm use
npm run bootstrap:doctor
npm run bootstrap:local
# add Stripe test values to .env.local when reported as missing
npm run dev
```

`bootstrap:local` installs locked dependencies, starts the pinned Supabase stack, derives local values, writes `.env.local` without replacing existing provider credentials, resets migrations and seed data, and reports any remaining provider inputs.

## Hosted bootstrap

After exporting the trusted provider and account values documented in [`docs/bootstrap.md`](docs/bootstrap.md), bootstrap development with:

```bash
npm run bootstrap -- --apply
```

The command reconciles GitHub governance and the development environment, runs CI, converges shared infrastructure, then deploys and verifies development. It dispatches from `main`, follows the exact Actions run, and fails if any stage fails.

Production remains an explicit target:

```bash
npm run bootstrap -- --apply --target=production
```

Staging is optional. Enable the extended release topology before targeting it:

```bash
ENABLE_RELEASE_TOPOLOGY=true npm run bootstrap -- --apply --target=staging
```

When the extended topology is disabled, staging fails closed instead of falling back to development or production infrastructure.

Without `--apply`, bootstrap is plan-only. Granular Terraform, provider, environment, and deployment workflows remain available for diagnostics and recovery.

## Checks

```bash
npm run config:check
npm run lint
npm run typecheck
npm run test:architecture
npm test
npm run build
npm run test:e2e
```

Pull-request CI also applies every database migration in order, loads seed data, runs SQL contract tests, verifies logical backup and restore, validates both Terraform stacks when configuration changes, and checks committed provider lockfiles.

## Documentation

- [`docs/bootstrap.md`](docs/bootstrap.md) — hosted setup, required values, and rerun guarantees
- [`docs/environments.md`](docs/environments.md) — configuration sources and GitHub intake
- [`docs/generated/environment-reference.md`](docs/generated/environment-reference.md) — generated runtime contract
- [`docs/deployment.md`](docs/deployment.md) — deployment and release behavior
- [`docs/provisioning.md`](docs/provisioning.md) — Terraform and provider ownership
- [`docs/local-dev.md`](docs/local-dev.md) — local development
- [`docs/security.md`](docs/security.md) — RLS, secrets, and administrator access
- [`docs/api-architecture.md`](docs/api-architecture.md) — server API boundaries, contracts, authorization, idempotency, and endpoint rules
- [`docs/data-model.md`](docs/data-model.md) — active application data model
- [`docs/admin-operations.md`](docs/admin-operations.md) — control-console workflows
- [`docs/storefront-ui.md`](docs/storefront-ui.md) — customer-visible status and implementation-detail boundaries
