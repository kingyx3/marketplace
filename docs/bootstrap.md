# Bootstrap guide

Use this runbook to take the repo from blank provider setup to working hosted `development` and `production` deployments. Keep the GitHub secrets list and versioned public config model in [`docs/environments.md`](environments.md); this file only describes the order of operations.

## Topology

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to non-`main` branches, unless docs-only | Preview | Development project | Active |
| `production` | `v*` tag or published release | Production | Production project | Active |
| `staging` | None | None | None | Reserved |

## 1. Prepare provider accounts

Create or confirm access to:

- **GitHub** repo admin for secrets, environments, and protection rules.
- **Google Cloud** project + service account JSON for the Terraform state bucket.
- **Vercel** API token.
- **Supabase** access token.
- **Stripe** test/live keys.
- **Google OAuth** Web application client(s) for hosted Supabase Auth.
- Optional notification providers only when those channels are needed.

## 2. Configure GitHub and versioned environment topology

1. Add required repository secrets from [`docs/environments.md`](environments.md#required-repository-secrets).
2. Create GitHub Environments `development` and `production`; leave `staging` empty/reserved.
3. Add required environment secrets from [`docs/environments.md`](environments.md#required-environment-secrets) to both active environments.
4. Fill non-secret public values in [`config/environments.json`](../config/environments.json) once known. GitHub Actions treats this file as authoritative for public config.
5. Add optional notification provider secrets only when needed.
6. Add required reviewers to `production` before launch.

## 3. Run Terraform

In GitHub Actions:

1. Run **Terraform State Bootstrap** with `apply=false`.
2. Review the plan, then rerun **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=false`.
4. Review the Vercel/Supabase project plan, then rerun **Terraform Platform** with `apply=true`.
5. Copy outputs into `config/environments.json` where they are not secret:
   - `vercel_project_id` → `VERCEL_PROJECT_ID` for both active environments.
   - `supabase_project_refs["development"]` → `SUPABASE_PROJECT_REF` in `development`.
   - `supabase_project_refs["production"]` → `SUPABASE_PROJECT_REF` in `production`.
6. Store Terraform-generated Supabase database passwords as `SUPABASE_DB_PASSWORD` in the matching GitHub Environment, or reset the password in Supabase and store that value instead.

## 4. Finish provider inputs

### Supabase

For each hosted project:

- Copy public API URL and publishable key into `config/environments.json`.
- Store the server secret key as `SUPABASE_SECRET_KEY` in the matching GitHub Environment.
- Add redirect allow-list entries:
  - `${NEXT_PUBLIC_SITE_URL}/auth/callback`
  - `${NEXT_PUBLIC_SITE_URL}/auth/callback**`
  - Local entries when needed: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback**`
- Do not edit schema by hand; schema, storage, grants, RLS, and RPCs come from migrations.

### Google OAuth

Run locally to print the exact URL plan:

```bash
npm run providers:plan
```

In Google Cloud, create/update a **Web application** OAuth client with:

- Authorized JavaScript origin: the origin from `NEXT_PUBLIC_SITE_URL`.
- Authorized redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.
- Local development entries when needed:
  - Origin: `http://localhost:3000`
  - Redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

Store hosted OAuth values as follows:

- `GOOGLE_OAUTH_CLIENT_ID` in `config/environments.json`.
- `GOOGLE_OAUTH_CLIENT_SECRET` as a secret in the matching GitHub Environment.

### Stripe

For each environment:

- Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `config/environments.json`.
- Store `STRIPE_SECRET_KEY` in the matching GitHub Environment.
- The managed webhook endpoint URL is `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
- The managed default event set is versioned in `config/environments.json`:
  - `payment_intent.amount_capturable_updated`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`
- Change `STRIPE_WEBHOOK_ENABLED_EVENTS` only when the app webhook route intentionally changes event coverage.

For the first Stripe webhook endpoint, use one of these explicit bootstrap paths:

```bash
npm run providers:apply -- --print-created-secret
```

Run that from a trusted local shell with the target environment values loaded. The script prints the newly created `whsec_...` signing secret and the `we_...` endpoint id exactly once; store the signing secret immediately as `STRIPE_WEBHOOK_SECRET` in the matching GitHub Environment and commit the endpoint id as `STRIPE_WEBHOOK_ENDPOINT_ID` in `config/environments.json`. Alternatively, create the webhook endpoint in the Stripe dashboard and store the same two values.

GitHub Actions intentionally does not create the first Stripe endpoint because Stripe returns a new endpoint's signing secret only once and the workflow cannot safely persist that value as a GitHub Environment secret. After the secret and endpoint id are stored, **Configure Providers** and **Bootstrap Environment** can safely update and verify the endpoint URL, enabled events, status, description, and metadata.

### Vercel

Confirm the Terraform-created project exists and `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` are present in `config/environments.json`. Do not maintain Vercel runtime env manually; bootstrap/deploy syncs it from the resolved environment.

## 5. Configure provider integrations

Run **Configure Providers** with `mode=plan` for `development` and `production`, then run it with `mode=apply` after reviewing the plan and storing the Stripe webhook signing secret.

This single workflow configures everything that can be safely managed through provider APIs:

- Supabase hosted Google Auth provider settings after the Google Cloud OAuth client exists.
- Stripe webhook endpoint URL, enabled events, status, description, and metadata after the endpoint signing secret is stored.

## 6. Bootstrap environments

Run **Bootstrap Environment** once for `development` and once for `production`.

The workflow delegates to `scripts/bootstrap-environment.mjs`, which resolves versioned public config, runs provider bootstrap in `--apply-if-configured` mode, validates the resolved environment, generates `.env.deploy`, syncs runtime env to Vercel, links Supabase, pushes migrations, and removes `.env.deploy`. It does **not** deploy the app.

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
