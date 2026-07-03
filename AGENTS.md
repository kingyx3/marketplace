# Operating instructions for agents and contributors

Standing rules for anyone (human or agent) working in this repository.
They are project-agnostic engineering rules; project-specific detail
lives in `docs/`.

## Environments & configuration

1. **Three environments**: `development` (feature branches), `staging`
   (pushes to `main`), `production` (tags/releases). Each maps 1:1 to a
   GitHub Environment holding its secrets and vars.
2. **Minimal secrets.** The set of operator-configured secrets/vars must
   stay small and documented. Everything else is derived. The contract
   lives in `scripts/generate-env.mjs` and is documented in
   `docs/environments.md` and `.env.example` — all three must stay in sync.
3. **`.env` is generated, never committed.** Real values exist only in
   GitHub Environments and provider dashboards. CI builds `.env` via
   `scripts/generate-env.mjs`; local dev copies `.env.example`.
4. **Config as source of truth.** Infrastructure and app configuration
   live in this repo (workflows, `supabase/`, `vercel`-synced env). Do
   not hand-edit provider dashboards for anything the repo can express.
5. **Production requires human approval** via GitHub Environment
   required reviewers. Never bypass or remove that gate.

## CI/CD

6. **Reusable workflows** (`workflow_call`) for anything invoked from
   more than one trigger; callers stay thin.
7. **Explicit job dependencies** (`needs:`) so failure ordering is
   obvious: env validation → migrations → deploy → smoke test. A failed
   upstream job must block everything downstream.
8. **Affected-path detection**: docs-only changes must not trigger app
   deploys; app-only changes must not re-run migration checks needlessly.
9. **Tests run in parallel** (lint, typecheck, unit, build, migrations)
   and the deploy is gated on required checks via branch protection.
10. **No secret values in logs**, ever — print key names only. Fail fast
    on missing/malformed configuration before touching infrastructure.

## Security

11. **Webhooks**: verify provider signatures against the raw body, and
    process idempotently (unique event-id ledger). Return 2xx for
    verified-but-ignored events.
12. **Least privilege**: the Supabase service-role key is server-side
    only; browser-facing code uses the anon key under RLS. New tables
    get RLS enabled with explicit policies before they ship.
13. **Money is integers** (cents) with an explicit currency column.
    Payment state changes are audit-logged.

## Cost controls

14. Prefer scale-to-zero / usage-based services. Set artifact and log
    retention explicitly. Cancel superseded CI runs (`concurrency`).
    Document recurring costs in `docs/cost-controls.md`.

## Documentation honesty

15. **Never document unbuilt features as complete.** Anything not yet
    implemented is marked TODO and tracked in `docs/build-plan.md`.
    README and docs describe the repo as it is, not as intended.
16. Keep `docs/` current with the code in the same PR that changes
    behavior; schema changes update `docs/data-model.md`.

## Development workflow

17. Work on feature branches; never push directly to `main`.
18. Before pushing: `npm run lint`, `npm run typecheck`, `npm test`, and
    `npm run build` must pass locally (see `docs/testing.md`).
19. Database changes are **new** migration files under
    `supabase/migrations/` — never edit an applied migration.
20. Commits are small and descriptive; PRs explain what changed, why,
    and any new required configuration.
