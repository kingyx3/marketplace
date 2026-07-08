# Operating instructions for agents and contributors

Standing rules for anyone (human or agent) working in this repository. They are project-agnostic engineering rules; project-specific detail lives in `docs/`.

## Environments & configuration

1. **Two active hosted environments**: `development` for feature-branch deploys and `production` for tags/releases. `staging` is reserved and must stay empty until the repo has a third Supabase project and a matching Vercel target.
2. **GitHub Environments are the source of truth.** Runtime and deploy configuration for hosted environments lives in the matching GitHub Environment, not in Vercel dashboards or committed `.env` files.
3. **Minimal secrets.** The operator-configured set must stay small and documented. Repository-level Terraform inputs and per-environment runtime/deploy inputs are documented in `docs/environments.md`; the full setup flow is in `docs/bootstrap.md`.
4. **`.env` is generated or local-only, never committed.** CI builds `.env.deploy` with `scripts/generate-env.mjs`, syncs runtime keys to Vercel, and removes the generated file. Local dev copies `.env.example` to `.env`.
5. **Keep contracts in sync.** When environment variables change, update `scripts/generate-env.mjs`, `lib/env.ts`, `.env.example`, workflow `env:` blocks, and `docs/environments.md` together.
6. **Config as code.** Infrastructure and app configuration live in this repo where possible: workflows, Terraform, `supabase/`, Vercel-synced env, and verifier scripts. Do not hand-edit provider dashboards for anything the repo can express.
7. **Production requires human approval** via GitHub Environment required reviewers. Never bypass or remove that gate.

## CI/CD

8. **Reusable workflows** (`workflow_call`) for anything invoked from more than one trigger; callers stay thin.
9. **Explicit job dependencies** (`needs:`) so failure ordering is obvious: env validation → migrations → deploy → smoke test. A failed upstream job must block everything downstream.
10. **Affected-path detection**: docs-only changes must not trigger app deploys; app-only changes must not re-run migration checks needlessly.
11. **Tests run in parallel** (lint, typecheck, unit, build, migrations) and the deploy is gated on required checks via branch protection.
12. **No secret values in logs**, ever — print key names only. Fail fast on missing/malformed configuration before touching infrastructure.

## Security

13. **Webhooks**: verify provider signatures against the raw body, and process idempotently with a unique event-id ledger. Return 2xx for verified-but-ignored events.
14. **Least privilege**: the Supabase secret/service-role key is server-side only; browser-facing code uses the publishable key under RLS. New tables get RLS enabled with explicit policies before they ship.
15. **Money is integers** (cents) with an explicit currency column. Payment state changes are audit-logged.

## Provisioning and bootstrap

16. **Terraform boundary**: Terraform owns the GCS state bucket, Vercel project shell, and Supabase project shells. Migrations own database schema; GitHub Environments own runtime and deploy secrets.
17. **Bootstrap before deploy**: after Terraform and environment values exist, run **Configure Google OAuth** when OAuth credentials change and **Bootstrap Environment** to sync Vercel env, link Supabase, and push migrations. Bootstrap must stay separate from normal app deploys.
18. **Database changes are migrations**: new SQL files under `supabase/migrations/`; never edit an applied migration.

## Cost controls

19. Prefer scale-to-zero / usage-based services. Set artifact and log retention explicitly. Cancel superseded CI runs (`concurrency`). Document recurring costs in `docs/cost-controls.md`.

## Documentation honesty

20. **Never document unbuilt features as complete.** Anything not yet implemented is marked TODO and tracked in `docs/build-plan.md`. README and docs describe the repo as it is, not as intended.
21. Keep `docs/` current with code in the same PR that changes behavior; schema changes update `docs/data-model.md`.

## Development workflow

22. Work on feature branches; never push directly to `main`.
23. Before pushing app/code changes: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` must pass locally (see `docs/testing.md`). For config/workflow changes also run `npm run config:check`.
24. Commits are small and descriptive; PRs explain what changed, why, and any new required configuration.