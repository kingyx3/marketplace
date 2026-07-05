# Marketplace

Sealed TCG booster box distribution — **B2C retail, B2B wholesale, and
pre-orders** — for Magic: The Gathering, Pokémon, Yu-Gi-Oh!, One Piece,
Lorcana, and Flesh and Blood. Singapore/SEA-first, with global benchmarks.
The deployed display name is supplied by the `APP_NAME` GitHub Environment
variable, synced to Vercel, and validated by CI before deployment.

This repository currently contains:

- **A deployable commerce foundation** — Next.js 15 + Supabase
  (Postgres/RLS/Auth) + Stripe, deployed to Vercel through GitHub Actions
  with a minimal, documented set of GitHub deploy credentials. Catalog,
  Google auth, account APIs, cart validation, checkout/payment primitives,
  and guarded order state transitions are implemented; remaining
  storefront/admin depth is tracked honestly in `docs/build-plan.md`.
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

Three GitHub Environments — `development` (feature branches), `staging`
(`main`), `production` (tags, human-approved). Configure the minimal GitHub
deploy secrets/vars listed in **docs/environments.md**, including `APP_NAME`.
Provider runtime configuration lives in Vercel Project Environment Variables;
CI syncs `APP_NAME`, pulls Vercel env, validates it, runs app and migration
checks, pushes database migrations, deploys to Vercel, and smoke tests
`/api/health`.

## Documentation map

| Doc                                                  | What it covers                                  |
| ---------------------------------------------------- | ----------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)         | Stack, rationale, alternatives considered       |
| [docs/environments.md](docs/environments.md)         | Every secret/var, per environment               |
| [docs/deployment.md](docs/deployment.md)             | Pipeline flow, gates, rollback                  |
| [docs/secrets-and-env-audit.md](docs/secrets-and-env-audit.md) | Current config audit and cleanup checklist |
| [docs/data-model.md](docs/data-model.md)             | Schema reference and key decisions              |
| [docs/security.md](docs/security.md)                 | RLS, webhooks, secrets handling                 |
| [docs/cost-controls.md](docs/cost-controls.md)       | Keeping the bill near zero pre-launch           |
| [docs/admin-operations.md](docs/admin-operations.md) | Manual admin runbooks until admin tooling ships |
| [docs/local-dev.md](docs/local-dev.md)               | Day-to-day development                          |
| [docs/testing.md](docs/testing.md)                   | Running and writing checks                      |
| [docs/build-plan.md](docs/build-plan.md)             | Roadmap — what is NOT built yet                 |
| [docs/research/](docs/research/README.md)            | The 14-section business research report         |
| [AGENTS.md](AGENTS.md)                               | Standing rules for contributors and agents      |
