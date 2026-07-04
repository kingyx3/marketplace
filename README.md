# marketplace

Sealed TCG booster box distribution — **B2C retail, B2B wholesale, and
pre-orders** — for Magic: The Gathering, Pokémon, Yu-Gi-Oh!, One Piece,
Lorcana, and Flesh and Blood. Singapore/SEA-first, with global benchmarks.

This repository currently contains:

- **A deployable commerce foundation** — Next.js 15 + Supabase
  (Postgres/RLS/Auth) + Stripe, deployed to Vercel through GitHub Actions
  with a minimal, documented set of secrets. Catalog, Google auth,
  account APIs, cart validation, checkout/payment primitives, and guarded
  order state transitions are implemented; remaining storefront/admin
  depth is tracked honestly in `docs/build-plan.md`.
- **A research report** — `docs/research/` covers the market, business
  models, supplier routes, customer segments, pre-order design,
  financials, and go-to-market for a TCG booster box business.

## Quickstart (local)

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # fill in values — see docs/local-dev.md
npx supabase start           # local Postgres + auth (Docker required)
npx supabase db reset        # apply migrations + seed
npm run dev                  # http://localhost:3000
```

Checks: `npm run lint && npm run typecheck && npm test && npm run build`

## Deployment

Three GitHub Environments — `development` (feature branches), `staging`
(`main`), `production` (tags, human-approved). Configure the 6 required
secrets and 6 vars per environment listed in **docs/environments.md**,
and CI/deploy do the rest: validate the env contract, run app and
migration checks, push database migrations, generate `.env`, sync it to
Vercel, deploy, and smoke test `/api/health`.

## Documentation map

| Doc | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Stack, rationale, alternatives considered |
| [docs/environments.md](docs/environments.md) | Every secret/var, per environment |
| [docs/deployment.md](docs/deployment.md) | Pipeline flow, gates, rollback |
| [docs/data-model.md](docs/data-model.md) | Schema reference and key decisions |
| [docs/security.md](docs/security.md) | RLS, webhooks, secrets handling |
| [docs/cost-controls.md](docs/cost-controls.md) | Keeping the bill near zero pre-launch |
| [docs/admin-operations.md](docs/admin-operations.md) | Manual admin runbooks until admin tooling ships |
| [docs/local-dev.md](docs/local-dev.md) | Day-to-day development |
| [docs/testing.md](docs/testing.md) | Running and writing checks |
| [docs/build-plan.md](docs/build-plan.md) | Roadmap — what is NOT built yet |
| [docs/research/](docs/research/README.md) | The 14-section business research report |
| [AGENTS.md](AGENTS.md) | Standing rules for contributors and agents |
