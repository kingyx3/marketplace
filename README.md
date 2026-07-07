# Marketplace

Sealed TCG booster box distribution — **B2C retail, B2B wholesale, and
pre-orders** — for Magic: The Gathering, Pokémon, Yu-Gi-Oh!, One Piece,
Lorcana, and Flesh and Blood. Singapore/SEA-first, with global benchmarks.
The deployed display name is supplied by the `APP_NAME` GitHub Environment
variable, synced to Vercel, and validated by CI before deployment.

This repository currently contains:

- **A deployable commerce foundation** — Next.js 15 + Supabase
  (Postgres/RLS/Auth) + Stripe, deployed to Vercel through GitHub Actions
  with GitHub Environments as the source of truth for deployment and runtime
  configuration. Catalog, Google auth, account APIs, cart validation,
  checkout/payment primitives, and guarded order state transitions are
  implemented; remaining storefront/admin depth is tracked honestly in
  `docs/build-plan.md`.
- **A research report** — `docs/research/` covers the market, business
  models, supplier routes, customer segments, pre-order design,
  financials, and go-to-market for a TCG booster box business.

## Quickstart (local)

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # fill in runtime values — see docs/local-dev.md
npx supabase start           # local Postgres + auth (Docker required)
npx supabase db reset        # apply migrations + seed
npm run dev                  # http://localhost:3000
```

Checks:
`npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

## Deployment

Two hosted GitHub Environments are active for now: `development` for feature
branches and `production` for release tags. They share one Vercel project:
development syncs to Vercel Preview, while production syncs to Vercel
Production. Supabase stays split into one development project and one production
project. `staging` is intentionally reserved and empty until paid plans justify a
third data environment.

Terraform provisioning is CI/CD-driven. Run **Terraform State Bootstrap** to
create/reconcile the GCS state bucket, then **Terraform Platform** to create the
shared Vercel project and Supabase projects. Variables are passed through GitHub
Actions vars/secrets, not committed tfvars files.

## Documentation map

| Doc                                                  | What it covers                                  |
| ---------------------------------------------------- | ----------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)         | Stack, rationale, alternatives considered       |
| [docs/environments.md](docs/environments.md)         | Every secret/var, per environment               |
| [docs/deployment.md](docs/deployment.md)             | Pipeline flow, gates, rollback                  |
| [docs/provisioning.md](docs/provisioning.md)         | Terraform bootstrap and state management        |
| [docs/data-model.md](docs/data-model.md)             | Schema reference and key decisions              |
| [docs/security.md](docs/security.md)                 | RLS, webhooks, secrets handling                 |
| [docs/cost-controls.md](docs/cost-controls.md)       | Keeping the bill near zero pre-launch           |
| [docs/admin-operations.md](docs/admin-operations.md) | Manual admin runbooks until admin tooling ships |
| [docs/local-dev.md](docs/local-dev.md)               | Day-to-day development                          |
| [docs/testing.md](docs/testing.md)                   | Running and writing checks                      |
| [docs/build-plan.md](docs/build-plan.md)             | Roadmap — what is NOT built yet                 |
| [docs/research/](docs/research/README.md)            | The 14-section business research report         |
| [AGENTS.md](AGENTS.md)                               | Standing rules for contributors and agents      |
