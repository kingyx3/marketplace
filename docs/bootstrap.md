# Bootstrap guide

Use this runbook to take the repo from blank provider setup to working hosted `development` and `production` deployments. Keep the GitHub secrets/vars list in [`docs/environments.md`](environments.md); this file only describes the order of operations.

## Topology

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to non-`main` branches, unless docs-only | Preview | Development project | Active |
| `production` | `v*` tag or published release | Production | Production project | Active |
| `staging` | None | None | None | Reserved |

## 1. Prepare provider accounts

Create or confirm access to:

- **GitHub** repo admin for secrets, variables, environments, and protection rules.
- **Google Cloud** project + service account JSON for the Terraform state bucket.
- **Vercel** API token.
- **Supabase** access token.
- **Stripe** test/live keys and webhook signing secrets.
- **Google OAuth** Web application client(s) for hosted Supabase Auth.
- Optional notification providers only when those channels are needed.

## 2. Configure GitHub

1. Add all required repository-level entries from [`docs/environments.md`](environments.md#required-github-secrets-and-variables).
2. Add optional repository-level entries only when defaults are not enough.
3. Create GitHub Environments `development` and `production`; leave `staging` empty/reserved.
4. Add required environment-level entries from [`docs/environments.md`](environments.md#required-github-secrets-and-variables) to both active environments.
5. Add optional environment-level notification entries only for enabled channels.
6. Add required reviewers to `production` before launch.

## 3. Run Terraform

In GitHub Actions:

1. Run **Terraform State Bootstrap** with `apply=false`.
2. Review the plan, then rerun **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=false`.
4. Review the Vercel/Supabase project plan, then rerun **Terraform Platform** with `apply=true`.
5. Copy outputs into GitHub Environments:
   - `vercel_project_id` → `VERCEL_PROJECT_ID` in both active environments.
   - `supabase_project_refs["development"]` → `SUPABASE_PROJECT_REF` in `development`.
   - `supabase_project_refs["production"]` → `SUPABASE_PROJECT_REF` in `production`.

Terraform-generated Supabase database passwords live in remote state. Store the matching password as `SUPABASE_DB_PASSWORD` in each active GitHub Environment, or reset the password in Supabase and store that value instead.

## 4. Finish provider dashboards

### Supabase

For each hosted project:

- Copy API URL, publishable key, and server secret key into the matching GitHub Environment.
- Add redirect allow-list entries:
  - `${NEXT_PUBLIC_SITE_URL}/auth/callback`
  - `${NEXT_PUBLIC_SITE_URL}/auth/callback**`
  - Local entries when needed: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback**`
- Do not edit schema by hand; schema, storage, grants, RLS, and RPCs come from migrations.

### Google OAuth

Run locally to print the exact URL plan:

```bash
npm run oauth:google:plan
```

In Google Cloud, create/update a **Web application** OAuth client with:

- Authorized JavaScript origin: the origin from `NEXT_PUBLIC_SITE_URL`.
- Authorized redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.
- Local development entries when needed:
  - Origin: `http://localhost:3000`
  - Redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

Then run **Configure Google OAuth** in GitHub Actions for `development` and `production`.

### Stripe

For each environment:

- Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` to the matching GitHub Environment.
- Create a webhook endpoint at `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
- Subscribe to:
  - `payment_intent.amount_capturable_updated`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`

### Vercel

Confirm the Terraform-created project exists and both active GitHub Environments have `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. Do not maintain Vercel runtime env manually; bootstrap/deploy syncs it from GitHub.

## 5. Bootstrap environments

Run **Bootstrap Environment** once for `development` and once for `production`.

The workflow validates the GitHub Environment, generates `.env.deploy`, syncs runtime env to Vercel, links Supabase, pushes migrations, and removes `.env.deploy`. It does **not** deploy the app.

## 6. Deploy

Development deploys automatically from non-`main` branches unless docs-only.

Production deploys from a release or `v*` tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Production should pause for GitHub Environment reviewer approval before mutable jobs run.

## 7. Verify

After deploy:

- `/api/health` returns HTTP 200.
- Production `/api/health?deep=1` returns HTTP 200.
- Google sign-in redirects through `/auth/callback` successfully.
- Stripe test-mode checkout works in `development` before live sales.

Useful local checks:

```bash
npm run env:check
npm run config:check
npm run lint
npm run typecheck
npm test
npm run build
```