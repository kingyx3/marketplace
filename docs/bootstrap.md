# Bootstrap guide

Use this runbook to take the repo from blank provider setup to working hosted `development` and `production` deployments. The goal is repeatable, idempotent bootstrap with no manual copying of Terraform outputs into committed config.

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
- Stripe test/live keys with PayNow enabled for the account.
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
- `GOOGLE_OAUTH_CLIENT_SECRET`

`STRIPE_WEBHOOK_SECRET` may also be supplied as a GitHub Environment secret, but it is not required before the first deploy. The deploy workflow creates or reconciles the Stripe endpoint before final runtime validation and persists the generated signing secret to the matching Vercel target.

Add optional notification provider secrets only when needed. Add required reviewers to `production` before launch.

Do not paste Terraform outputs or provider public IDs into `config/environments.json`. CI/CD resolves those during each workflow run.

## 3. Run Terraform

In GitHub Actions:

1. Run **Terraform State Bootstrap** with `apply=false`.
2. Review the plan, then rerun **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=false`.
4. Review the Vercel/Supabase project plan, then rerun **Terraform Platform** with `apply=true`.

The platform stack outputs the Vercel project id, Supabase project refs/URLs, and Terraform-generated Supabase database passwords. Downstream workflows read those outputs directly from Terraform state.

Terraform import bootstrap inspects state before importing. It treats only an explicitly missing remote object as a create case and fails on permission, credential, or provider errors instead of hiding them.

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
- Enable PayNow on the Stripe account. Application-created PaymentIntents are restricted to `payment_method_types=["paynow"]` and SGD.
- Do not configure card, reusable payment methods, setup-future-usage, or manual capture. PayNow is a single-use immediate payment method.
- The managed webhook endpoint URL is `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
- The event set is versioned in `config/environments.json`: `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.refunded`.

The normal deploy path performs pre-provision validation without requiring `STRIPE_WEBHOOK_SECRET`, then runs `scripts/provision-stripe-webhook.mjs` before generating the runtime environment:

- When the endpoint and signing secret already exist, it verifies or updates the endpoint.
- When no endpoint exists, it creates one and passes Stripe's one-time `whsec_...` value to later workflow steps through the masked GitHub Actions environment file.
- When an endpoint exists but its signing secret is unavailable, it creates a replacement, captures the new secret, and removes the old endpoint only after the new credentials are available.
- The runtime environment sync stores the resulting secret in Vercel. Later deploys inject that sensitive value into the reconcile process with `vercel env run`, without writing it to a file.

A trusted local shell remains available as a recovery or manual bootstrap path:

```bash
npm run providers:apply -- --print-created-secret
```

Stripe reveals this only when an endpoint is created. When using the local path, store the printed signing secret immediately as `STRIPE_WEBHOOK_SECRET` in the matching GitHub Environment or Vercel target. CI can resolve `STRIPE_WEBHOOK_ENDPOINT_ID` later when exactly one endpoint matches the target URL, or you can set it as an environment variable to pin reconciliation.

### Vercel

Terraform creates/reconciles the Vercel project shell. CI resolves `VERCEL_PROJECT_ID` from Terraform and `VERCEL_ORG_ID` from Vercel when possible. Do not maintain Vercel runtime env manually; bootstrap/deploy syncs it from the resolved environment.

Runtime variables are compared with keyed fingerprints inside `vercel env run`, so unchanged values are not rewritten and sensitive values are never printed. Deployments are tagged with a source-and-configuration fingerprint; rerunning the same revision with the same resolved runtime configuration reuses the existing ready deployment.

## 5. Configure provider integrations

Run **Configure Providers** with `mode=plan` for `development` and `production`, then run it with `mode=apply` after reviewing the plan. This remains useful for Google OAuth configuration and explicit provider reconciliation; the normal deploy workflow also reconciles Stripe before runtime validation.

This workflow:

- Reads Terraform outputs from state.
- Resolves provider values through `scripts/resolve-environment.mjs`.
- Applies hosted Supabase Google Auth provider settings after the OAuth client exists.
- Updates/verifies Stripe webhook endpoint URL, enabled events, status, description, and metadata when the endpoint signing secret is available.

## 6. Bootstrap environments

Run **Bootstrap Environment** once for `development` and once for `production`.

The workflow delegates to `scripts/bootstrap-environment.mjs`, which runs provider bootstrap in `--apply-if-configured` mode, validates the resolved environment, generates `.env.deploy`, syncs Vercel env, links Supabase, pushes migrations, and removes `.env.deploy`. It does not deploy the app.

## 7. Deploy

Development deploys automatically from non-`main` branches unless docs-only. Before the final environment contract check and Vercel deployment, the workflow injects any existing Vercel signing secret into the Stripe reconciliation process or creates a new endpoint and secret when none exists.

Production deploys from a release or `v*` tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Production should pause for GitHub Environment reviewer approval before mutable jobs run.

All workflows that mutate a hosted environment share the same per-environment concurrency lock. Terraform, provider reconciliation, bootstrap, and deployment therefore run serially rather than racing each other. Re-running a completed operation converges on the same provider resources, environment values, database schema, and deployment URL.

## 8. Verify

After deploy:

- `/api/health` returns HTTP 200.
- Production `/api/health?deep=1` returns HTTP 200.
- Google sign-in redirects through `/auth/callback` successfully.
- PayNow test-mode checkout works in `development` before live sales.
- Re-running the same deploy reports unchanged Vercel environment values and reuses the ready deployment.

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
4. Keep `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, and `GOOGLE_OAUTH_CLIENT_SECRET` as environment secrets. Existing `STRIPE_WEBHOOK_SECRET` values remain valid, but new environments can let deploy provision and persist the value automatically.
5. Remove manually copied `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` from GitHub Environments after the resolver succeeds.
6. Run **Configure Providers** in `plan`, then `apply`, and run **Bootstrap Environment** for both active environments.
