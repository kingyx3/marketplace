# Secrets & environment audit

## Summary

The repository already had a solid Supabase, Vercel, and GitHub deployment
foundation: Next.js deploy config is checked in, Supabase migrations and
storage policies are validated in CI, and deploys are gated behind app and
migration checks.

The main issue was configuration ownership. GitHub Environment values were
being treated as the source of truth for app runtime configuration and then
synced into Vercel on each deploy. This PR changes that so GitHub keeps only
what CI/CD needs to connect to Supabase and Vercel, while Vercel owns app
runtime configuration.

## Required GitHub Environment entries

Keep only these values in each GitHub Environment.

| Key | Type | Why it remains in GitHub |
| --- | ---- | ------------------------ |
| `SUPABASE_ACCESS_TOKEN` | secret | Lets GitHub Actions run Supabase CLI migrations. |
| `SUPABASE_DB_PASSWORD` | secret | Lets `supabase link` connect to the target database. |
| `VERCEL_TOKEN` | secret | Lets GitHub Actions pull Vercel env and create deployments. |
| `SUPABASE_PROJECT_REF` | var | Identifies the Supabase project for migration pushes. |
| `VERCEL_ORG_ID` | var | Lets the Vercel CLI target the correct team/account. |
| `VERCEL_PROJECT_ID` | var | Lets the Vercel CLI target the correct project. |

`TARGET_ENV` is generated from the workflow input and should not be stored as
a GitHub variable.

## Values to remove from GitHub

Move app runtime values to Vercel Project Environment Variables if they
currently exist in GitHub. This includes public browser-safe app values,
server-only Supabase and Stripe values, app display/site values, and optional
notification provider values.

The full runtime list is maintained in `docs/environments.md` and
`.env.example`.

## Automated checks added or updated

- Deploy CI validates the minimal GitHub deploy keys before migrations or
  Vercel deployment.
- Deploy CI runs `vercel pull`, validates the pulled Vercel runtime env using
  `scripts/generate-env.mjs --check`, and deploys only after validation passes.
- `scripts/verify-vercel-config.mjs` now fails if the deploy workflow maps
  runtime app env from GitHub or tries to push runtime env values into Vercel.

## Manual cleanup checklist

1. In Vercel Project Settings → Environment Variables, add the required
   runtime values for Preview and Production.
2. If staging and development need different values while both use Vercel
   Preview deploys, add branch-specific Preview overrides.
3. In GitHub Environments, keep only the six deploy entries listed above.
4. Remove `TARGET_ENV` from GitHub vars; the workflow now generates it.
5. Remove runtime app values from GitHub after confirming Vercel has the
   corresponding values.
6. Re-run the deploy workflow and confirm `/api/health` and deep readiness
   checks pass.

## Safety notes

- No real values should be committed, printed, or copied into PR text.
- `.env`, `.env.*`, and `.vercel/` remain gitignored.
- Runtime keys are still required by the app, but they now live in Vercel
  instead of GitHub.
