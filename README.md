# Marketplace

Sealed TCG booster box distribution — **B2C retail, B2B wholesale, and pre-orders** — for Magic: The Gathering, Pokémon, Yu-Gi-Oh!, One Piece, Lorcana, and Flesh and Blood. Singapore/SEA-first, with global benchmarks. The deployed display name defaults to `APP_NAME=Marketplace`, is resolved by CI, synced to Vercel, and validated before deployment.

This repository currently contains:

- **A deployable commerce foundation** — Next.js 15 + Supabase (Postgres/RLS/Auth/Storage) + Stripe, deployed to Vercel through GitHub Actions. Implemented coverage includes live catalog and storefront listing controls, Google auth, account/order/pre-order APIs, cookie cart validation, Stripe checkout/payment primitives, guarded order state transitions, B2B invoice checkout, pre-order allocation/balance conversion, waitlist/drop notifications, and staff-gated admin operations for catalog, listings, inventory, orders, pre-orders, wholesale review, and supplier PO intake. Remaining polish is tracked in `docs/build-plan.md`.
- **Infrastructure and deployment automation** — Terraform bootstraps the GCS state bucket, shared Vercel project, and active Supabase project shells; GitHub Actions resolve provider outputs, configure hosted Supabase Google OAuth, reconcile Stripe webhooks, sync env to Vercel, push migrations, deploy, and smoke test.
- **A research report** — `docs/research/` covers the market, business models, supplier routes, customer segments, pre-order design, financials, and go-to-market for a TCG booster box business.

## Quickstart (local)

```bash
nvm use                      # Node 22
npm ci
cp .env.example .env         # fill in runtime values — see docs/local-dev.md
npx supabase start           # local Postgres + auth (Docker required)
npx supabase db reset        # apply migrations + seed
npm run dev                  # http://localhost:3000
```

Checks:
`npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

## Hosted setup and deployment

Two hosted GitHub Environments are active: `development` for feature branches and `production` for release tags/published releases. They share one Vercel project: development syncs to Vercel Preview, while production syncs to Vercel Production. Supabase stays split into one development project and one production project. `staging` is intentionally reserved and empty until paid plans justify a third data environment.

Start with the full bootstrap runbook:

1. Configure the shared workflow secrets and per-environment operator values.
2. Run **Terraform State Bootstrap** once for the shared state bucket.
3. Run **Terraform Platform** once for the shared Vercel project and both active Supabase projects.
4. Finish manual provider inputs such as Supabase secret keys, Google OAuth clients, and Stripe account-level PayNow settings.
5. Choose either:
   - deploy first and let CI create/persist the Stripe webhook secret, then run **Configure Providers**; or
   - pre-provision the Stripe endpoint locally, store its signing secret, then run **Configure Providers** and **Bootstrap Environment** before deployment.
6. Deploy development from a feature branch or production from a `v*` tag/release.

See [`docs/bootstrap.md`](docs/bootstrap.md) for the exact prerequisites, path-dependent Stripe handling, workflow order, and verification steps.

## Documentation map

| Doc | What it covers |
| --- | --- |
| [docs/bootstrap.md](docs/bootstrap.md) | End-to-end setup from provider accounts to hosted bootstrap/deploy |
| [docs/architecture.md](docs/architecture.md) | Stack, rationale, alternatives considered |
| [docs/environments.md](docs/environments.md) | Every repository/environment secret and variable |
| [docs/deployment.md](docs/deployment.md) | Pipeline flow, gates, rollback |
| [docs/provisioning.md](docs/provisioning.md) | Terraform boundary, state, and provider project provisioning |
| [docs/data-model.md](docs/data-model.md) | Schema reference and key decisions |
| [docs/security.md](docs/security.md) | RLS, webhooks, secrets handling |
| [docs/cost-controls.md](docs/cost-controls.md) | Keeping the bill near zero pre-launch |
| [docs/admin-operations.md](docs/admin-operations.md) | Manual admin runbooks and protected admin surface |
| [docs/local-dev.md](docs/local-dev.md) | Day-to-day development |
| [docs/testing.md](docs/testing.md) | Running and writing checks |
| [docs/build-plan.md](docs/build-plan.md) | Roadmap — what is built and what is not |
| [docs/research/](docs/research/README.md) | The 14-section business research report |
| [AGENTS.md](AGENTS.md) | Standing rules for contributors and agents |
