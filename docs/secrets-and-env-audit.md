# Secrets & environment audit

## Summary

The repository already had a solid Supabase, Vercel, and GitHub deployment
foundation: Next.js deploy config is checked in, Supabase migrations and
storage policies are validated in CI, and deploys are gated behind app and
migration checks.

Configuration ownership remains split intentionally: GitHub Environment values
are only for CI/CD and migrations, while Vercel owns provider runtime
configuration. This update also replaces the legacy Supabase runtime key names
with the current publishable/secret key names throughout the app contract.

## Required GitHub Environment entries

Keep only these values in each GitHub Environment.

| Key | Type | Why it remains in GitHub |
| --- | ---- | ------------------------ |
| `APP_NAME` | var | Repo-owned app display name synced to Vercel on deploy. |
| `SUPABASE_ACCESS_TOKEN` | secret | Lets GitHub Actions run Supabase CLI migrations. |
| `SUPABASE_DB_PASSWORD` | secret | Lets `supabase link` connect to the target database. |
| `VERCEL_TOKEN` | secret | Lets GitHub Actions pull Vercel env and create deployments. |
| `SUPABASE_PROJECT_REF` | var | Identifies the Supabase project for migration pushes. |
| `VERCEL_ORG_ID` | var | Lets the Vercel CLI target the correct team/account. |
| `VERCEL_PROJECT_ID` | var | Lets the Vercel CLI target the correct project. |

`TARGET_ENV` is generated from the workflow input and should not be stored as
a GitHub variable.

## Runtime Supabase key-name migration

Use the current Supabase API key names for runtime configuration.

| Remove old name | Add new name | Store as |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel var |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` | Vercel secret |

The app no longer reads the old names. If they exist in GitHub Environments,
remove them; runtime provider values belong in Vercel.

## Values to remove from GitHub

Move provider runtime values to Vercel Project Environment Variables if they
currently exist in GitHub. This includes public browser-safe provider values,
server-only Supabase and Stripe values, site URL values, and optional
notification provider values.

Keep `APP_NAME` in GitHub. The deploy workflow syncs only `APP_NAME` to Vercel
before pulling and validating runtime env.

The full runtime list is maintained in `docs/environments.md` and
`.env.example`.

## Automated checks added or updated

- Deploy CI validates the minimal GitHub deploy keys, including `APP_NAME`,
  before migrations or Vercel deployment.
- Deploy CI syncs only `APP_NAME` from GitHub vars to Vercel.
- Deploy CI runs `vercel pull`, validates the pulled Vercel runtime env using
  `scripts/generate-env.mjs --check`, and deploys only after validation passes.
- `scripts/verify-vercel-config.mjs` fails if the deploy workflow maps provider
  runtime env from GitHub or reintroduces full runtime env syncing, including
  either the old or new Supabase runtime key names.

## Manual cleanup checklist

1. In Vercel Project Settings → Environment Variables, add
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` for Preview
   and Production.
2. Remove `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from
   Vercel after confirming the new names are present.
3. If staging and development need different values while both use Vercel
   Preview deploys, add branch-specific Preview overrides.
4. In GitHub Environments, keep only the deploy entries listed above, including
   `APP_NAME`.
5. Remove `TARGET_ENV` from GitHub vars; the workflow now generates it.
6. Remove provider runtime values from GitHub after confirming Vercel has the
   corresponding values.
7. Re-run the deploy workflow and confirm `/api/health` and deep readiness
   checks pass.

## Safety notes

- No real values should be committed, printed, or copied into PR text.
- `.env`, `.env.*`, and `.vercel/` remain gitignored.
- Provider runtime keys are still required by the app, but they now live in
  Vercel instead of GitHub. `APP_NAME` remains in GitHub as a safe non-secret
  input.
