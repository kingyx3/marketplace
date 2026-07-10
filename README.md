# Marketplace

Sealed TCG booster-box distribution for B2C retail, B2B wholesale, and pre-orders. The application is Next.js 15 with Supabase, Stripe PayNow, Vercel, Terraform, and GitHub Actions.

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

The hosted path is convergent and safe to rerun:

1. From a trusted authenticated shell, inspect GitHub setup with `npm run bootstrap:github` and `npm run github:governance`, then apply it once with `npm run bootstrap:github:apply`.
2. Run **Terraform State Bootstrap** in `reconcile`, then `plan`, then `apply` with the reviewed plan run id.
3. Run **Terraform Platform** in `reconcile`, then `plan`, then `apply` with the reviewed plan run id.
4. Complete dashboard-only account prerequisites: Google OAuth clients/consent ownership and Stripe PayNow account enablement.
5. Run **Bootstrap Environment** with `mode=apply` for `development`, then `production`.
6. Rerun **Bootstrap Environment** with `mode=verify` to prove there is no Terraform, provider, Vercel runtime, or health drift.
7. Deploy development from the `develop` integration branch and production from a `v*` tag or published release.

**Bootstrap Environment** creates or repairs the Stripe webhook transactionally, applies/validates hosted Supabase Google Auth, syncs Vercel runtime values, links Supabase, and pushes migrations. There is no separate first-deploy Stripe path. The verification mode is non-mutating and acts as the live production-readiness gate.

See [`docs/bootstrap.md`](docs/bootstrap.md) for the complete runbook.

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

- [`docs/bootstrap.md`](docs/bootstrap.md) — end-to-end setup, release gate, and rerun guarantees
- [`docs/environments.md`](docs/environments.md) — configuration sources and GitHub intake
- [`docs/generated/environment-reference.md`](docs/generated/environment-reference.md) — generated environment contract
- [`docs/deployment.md`](docs/deployment.md) — CI/CD and release behavior
- [`docs/provisioning.md`](docs/provisioning.md) — Terraform/provider ownership
- [`docs/local-dev.md`](docs/local-dev.md) — local development
- [`docs/security.md`](docs/security.md) — RLS, secrets, webhooks
- [`docs/build-plan.md`](docs/build-plan.md) — implemented and remaining product work
