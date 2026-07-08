# Bootstrap guide

Use this runbook to take the repo from blank provider setup to working hosted `development` and `production` deployments. The goal is repeatable bootstrap with no manual copying of Terraform outputs into committed config.

## Topology

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to non-`main` branches, unless docs-only | Preview | Development project | Active |
| `production` | `v*` tag or published release | Production | Production project | Active |
| `staging` | None | None | None | Reserved |

## 1. Prepare provider accounts

Create or confirm access to:

- GitHub repo admin for secrets, environments, and protection rules.
- Google Cloud project + service account JSON for the Terraform state bucket.
- Vercel API token.
- Supabase access token.
- Stripe test/live keys.
- Google OAuth Web application clients for hosted Supabase Auth.
- Optional notification providers only when those channels are needed.

## 2. Configure GitHub

Add required repository secrets:

- `GCP_TERRAFORM_CREDENTIALS_JSON`
- `VERCEL_TOKEN`
- `SUPABASE_ACCESS_TOKEN`

Create GitHub Environments `development` and `production`; leave `staging` empty/reserved.

Add required environment variables to both active environments:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`

Add required environment secrets to both active environments:

- `SUPABASE_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Add optional notification provider secrets only when needed. Add required reviewers to `production` before launch.

Do not paste Terraform outputs or provider public IDs into `config/environments.json`. CI/CD resolves those during each workflow run.

## 3. Run Terraform

In GitHub Actions:

1. Run **Terraform State Bootstrap** with `apply=false`.
2. Review the plan, then rerun **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=false`.
4. Review the Vercel/Supabase project plan, then rerun **Terraform Platform** with `apply=true`.

The platform stack outputs the Vercel project id, Supabase project refs/URLs, and Terraform-generated Supabase database passwords. Downstream workflows read those outputs directly from Terraform state.

## 4. Finish provider inputs

### Supabase

For each hosted project:

- Store the server secret key as `SUPABASE_SECRET_KEY` in the matching GitHub Environment.
- Keep schema, storage, grants, RLS, and RPCs in migrations.
- Let CI resolve `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### Google OAuth

Create/update a Google Cloud **Web application** OAuth client with:

- Authorized JavaScript origin: the origin from `NEXT_PUBLIC_SITE_URL`.
- Authorized redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.
- Local development entries when needed:
  - Origin: `http://localhost:3000`
  - Redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

Store hosted OAuth values in the matching GitHub Environment:

- `GOOGLE_OAUTH_CLIENT_ID` as an environment variable.
- `GOOGLE_OAUTH_CLIENT_SECRET` as an environment secret.

TODO: move Google OAuth client creation/rotation into Terraform or a dedicated provider reconcile step once the project has the right Google API surface and consent-screen ownership encoded.

### Stripe

For each environment:

- Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as an environment variable.
- Store `STRIPE_SECRET_KEY` as an environment secret.
- The managed webhook endpoint URL is `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
- The default event set is versioned in `config/environments.json`.

For the first Stripe webhook endpoint, use one of these explicit bootstrap paths:

```bash
npm run providers:apply -- --print-created-secret
```

Run that from a trusted local shell with the target environment values loaded. The script prints the newly created `whsec_...` signing secret exactly once; store it immediately as `STRIPE_WEBHOOK_SECRET` in the matching GitHub Environment. CI can resolve `STRIPE_WEBHOOK_ENDPOINT_ID` later when exactly one endpoint matches the target URL, or you can set it as an environment variable to pin reconciliation.

GitHub Actions intentionally does not create the first Stripe endpoint because Stripe returns the signing secret only once and this repo does not grant Actions permission to persist it as a GitHub Environment secret.

### Vercel

Terraform creates/reconciles the Vercel project shell. CI resolves `VERCEL_PROJECT_ID` from Terraform and `VERCEL_ORG_ID` from Vercel when possible. Do not maintain Vercel runtime env manually; bootstrap/deploy syncs it from the resolved environment.

## 5. Configure provider integrations

Run **Configure Providers** with `mode=plan` for `development` and `production`, then run it with `mode=apply` after reviewing the plan and storing one-time secrets.

This workflow:

- Reads Terraform outputs from state.
- Resolves provider values through `scripts/resolve-environment.mjs`.
- Applies hosted Supabase Google Auth provider settings after the OAuth client exists.
- Updates/verifies Stripe webhook endpoint URL, enabled events, status, description, and metadata after the endpoint signing secret exists.

## 6. Bootstrap environments

Run **Bootstrap Environment** once for `development` and once for `production`.

The workflow delegates to `scripts/bootstrap-environment.mjs`, which runs provider bootstrap in `--apply-if-configured` mode, validates the resolved environment, generates `.env.deploy`, syncs runtime env to Vercel, links Supabase, pushes migrations, and removes `.env.deploy`. It does not deploy the app.

## 7. Deploy

Development deploys automatically from non-`main` branches unless docs-only.

Production deploys from a release or `v*` tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Production should pause for GitHub Environment reviewer approval before mutable jobs run.

## 8. Verify

After deploy:

- `/api/health` returns HTTP 200.
- Production `/api/health?deep=1` returns HTTP 200.
- Google sign-in redirects through `/auth/callback` successfully.
- Stripe test-mode checkout works in `development` before live sales.

Useful local checks:

```bash
npm run env:resolve -- development
npm run env:check
npm run config:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Migration from the old config flow

1. Stop filling new values in `config/environments.json`; keep only stable defaults such as `APP_NAME` and the Stripe webhook event set.
2. Rename any repository secret `VERCEL_API_TOKEN` to `VERCEL_TOKEN`.
3. Move `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `GOOGLE_OAUTH_CLIENT_ID` to environment variables.
4. Keep `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `GOOGLE_OAUTH_CLIENT_SECRET` as environment secrets.
5. Remove manually copied `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` from GitHub Environments after the resolver succeeds.
6. Run **Configure Providers** in `plan`, then `apply`, and run **Bootstrap Environment** for both active environments.
