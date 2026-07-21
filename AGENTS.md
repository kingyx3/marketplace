# Operating instructions for agents and contributors

## Configuration

1. `config/environment-contract.json` is the single environment source of truth.
2. After changing it, run `npm run env:artifacts:write`; never edit generated `.env.example`, `lib/env-contract.generated.ts`, or `docs/generated/environment-reference.md` directly.
3. Hosted values resolve from GitHub, Terraform, provider APIs, then stable committed defaults.
4. Do not manually copy provider/Terraform-generated identifiers into committed config.
5. Never print secrets. Provider-generated one-time credentials must be masked and transactionally persisted.

## Bootstrap and infrastructure

6. Shared infrastructure uses the `marketplace-shared-infrastructure` concurrency lock.
7. Per-environment mutations use `marketplace-environment-<environment>` locks.
8. Terraform `plan` is read-only. Imports/state removal occur only in `reconcile`; `apply` must use the exact reviewed plan artifact/run id.
9. Provider reconcilers implement discover, diff, minimal apply, verify, and safe rerun behavior.
10. HitPay desired state lives only in `scripts/lib/hitpay-webhook.mjs`.
11. Database changes are forward-only migrations; never edit an applied migration.
12. Production remains protected by GitHub Environment reviewers.

## Development and CI

13. The shared development data environment follows the `develop` integration branch, not every feature branch.
14. Reuse `.github/workflows/app-checks.yml` for application quality gates.
15. Before pushing: `npm run config:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
16. Pin operational tool/provider versions and update them through reviewed dependency PRs.
17. Documentation must describe implemented behavior and be updated in the same PR.
