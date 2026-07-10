# Bootstrap guide

Use this runbook to take the repository from blank provider accounts to working hosted `development` and `production` deployments. It describes the behavior implemented by the current Terraform stacks, GitHub Actions workflows, and provider scripts.

The hosted flow is output-driven: do not copy Terraform outputs or provider-generated public values into committed configuration.

## Topology

| GitHub Environment | Trigger | Vercel target | Supabase project | Status |
| --- | --- | --- | --- | --- |
| `development` | Push to non-`main` branches, unless docs-only | Preview | Development project | Active |
| `production` | `v*` tag or published release | Production | Production project | Active |
| `staging` | None | None | None | Reserved |

Terraform manages one shared Vercel project plus one Supabase project for each active environment. The state and platform workflows therefore run once for the shared stack, not once per application environment.

## 1. Prepare provider accounts

Create or confirm access to:

- GitHub repository administration for secrets, environments, and protection rules.
- A Google Cloud project and service-account JSON for the Terraform state bucket.
- A Vercel API token.
- A Supabase access token.
- Stripe test/live keys with PayNow enabled for the account.
- Google OAuth Web application clients for hosted Supabase Auth.
- Optional notification providers only when those channels are needed.

## 2. Configure GitHub

Create GitHub Environments named `development` and `production`. Keep `staging` empty and reserved. Add required reviewers to `production` before launch.

### Shared workflow secrets

Repository-level secrets are the simplest setup because the shared Terraform workflows can be launched against either active GitHub Environment. Environment-level secrets also work when they are present in the environment selected for the workflow run.

- `GCP_TERRAFORM_CREDENTIALS_JSON`
- `VERCEL_TOKEN`
- `SUPABASE_ACCESS_TOKEN`

### Operator-supplied values for each active environment

| Location | Name | Notes |
| --- | --- | --- |
| Variable | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test key for `development`, live key for `production`. |
| Variable | `GOOGLE_OAUTH_CLIENT_ID` | Required for hosted Google sign-in. |
| Variable | `NEXT_PUBLIC_SITE_URL` | Set the stable canonical URL when it differs from the Vercel project URL inferred by the resolver. The resolved runtime contract always requires a URL. |
| Secret | `SUPABASE_SECRET_KEY` | Server-only Supabase key for the matching project. |
| Secret | `STRIPE_SECRET_KEY` | Test key for `development`, live key for `production`. |
| Secret | `GOOGLE_OAUTH_CLIENT_SECRET` | Secret for the matching Google Web OAuth client. |

`STRIPE_WEBHOOK_SECRET` is required by the running application, but it is path-dependent during initial setup:

- The normal deploy workflow can create or replace the endpoint, capture Stripe's one-time signing secret, and persist it to the matching Vercel target.
- **Configure Providers** and **Bootstrap Environment** do not recover a Vercel-only signing secret. To use those workflows before the first deploy, create the endpoint from a trusted local shell and store `STRIPE_WEBHOOK_SECRET` in the matching GitHub Environment first.

Optional Terraform overrides such as `GCP_PROJECT_ID`, `PROJECT_SLUG`, `TF_STATE_BUCKET_NAME`, `SUPABASE_ORGANIZATION_ID`, `VERCEL_TEAM_ID`, and `SUPABASE_REGION` are documented in `docs/environments.md`. The resolver derives defaults when possible.

Do not paste Terraform outputs or provider public IDs into `config/environments.json`. CI/CD resolves them during each workflow run.

## 3. Run Terraform once for the shared stack

For both Terraform workflows, select an active GitHub Environment that can access the shared workflow secrets and any Terraform overrides. `development` is normally the least surprising choice because it does not carry the production approval gate.

In GitHub Actions:

1. Run **Terraform State Bootstrap** with `apply=false`.
2. Review the plan, then rerun **Terraform State Bootstrap** with `apply=true`.
3. Run **Terraform Platform** with `apply=false`.
4. Review the Vercel/Supabase project plan, then rerun **Terraform Platform** with `apply=true`.

The platform stack creates/reconciles the shared Vercel project and both active Supabase project shells. It outputs the Vercel project id, Supabase project refs/URLs, and Terraform-generated Supabase database passwords. Downstream workflows read those values directly from remote state.

Terraform import bootstrap inspects state before importing. It treats only an explicitly missing remote object as a create case and fails on permission, credential, or provider errors instead of hiding them.

## 4. Finish provider inputs

### Supabase

For each hosted project:

- Store its server secret key as `SUPABASE_SECRET_KEY` in the matching GitHub Environment.
- Keep schema, storage, grants, RLS, and RPCs in migrations.
- Let CI resolve `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_DB_PASSWORD`.

### Google OAuth

Create or update a Google Cloud **Web application** OAuth client with:

- Authorized JavaScript origin: the resolved `NEXT_PUBLIC_SITE_URL` origin.
- Authorized redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.
- Local development entries when needed:
  - Origin: `http://localhost:3000`
  - Redirect URI: `http://127.0.0.1:54321/auth/v1/callback`

Store hosted OAuth values in the matching GitHub Environment:

- `GOOGLE_OAUTH_CLIENT_ID` as an environment variable.
- `GOOGLE_OAUTH_CLIENT_SECRET` as an environment secret.

TODO: move Google OAuth client creation/rotation into Terraform or a dedicated provider reconcile step once the project has the required Google API and consent-screen ownership encoded.

### Stripe

For each environment:

- Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` from the same Stripe mode.
- Enable PayNow on the Stripe account.
- Application-created PaymentIntents are normalized to SGD with `payment_method_types=["paynow"]`.
- Do not rely on card, reusable-payment-method, setup-future-usage, or manual-capture behavior; the shared Stripe client removes those incompatible options.
- The managed webhook URL is `${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`.
- The versioned event set is `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.refunded`.

The normal deploy path runs `scripts/provision-stripe-webhook.mjs` before final runtime validation:

- If the endpoint and signing secret are available, it verifies or updates the endpoint.
- If no endpoint exists, it creates one and passes the one-time `whsec_...` value to later workflow steps through the masked GitHub Actions environment file.
- If an endpoint exists but its signing secret is unavailable, it creates a replacement and removes the old endpoint only after the new credentials are available.
- Runtime env sync persists the resulting secret to Vercel. Later deploys inject that stored value into reconciliation with `vercel env run` without writing it to a file.

### Optional local Stripe pre-provisioning

Use this only when you want **Configure Providers** or **Bootstrap Environment** to complete before the first app deploy. Run it from a trusted local shell, separately for each environment:

```bash
TARGET_ENV=development \
NEXT_PUBLIC_SITE_URL=https://your-development-host.example \
APP_NAME=Marketplace \
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_WEBHOOK_ENABLED_EVENTS="payment_intent.succeeded payment_intent.payment_failed charge.refunded" \
node scripts/configure-stripe.mjs --apply --print-created-secret
```

For production, use the production URL, `TARGET_ENV=production`, and the live Stripe key. Store the printed `whsec_...` value as `STRIPE_WEBHOOK_SECRET` in the matching GitHub Environment. Store the printed `we_...` id as the optional `STRIPE_WEBHOOK_ENDPOINT_ID` variable when you want reconciliation pinned to that endpoint.

The aggregate `npm run providers:apply -- --print-created-secret` command also runs Google OAuth configuration, so use it locally only after the full resolved Supabase/OAuth environment is available. Prefer the direct Stripe command above when only the webhook needs initial provisioning.

### Vercel

Terraform creates/reconciles the Vercel project shell. CI resolves `VERCEL_PROJECT_ID` from Terraform and `VERCEL_ORG_ID` from Vercel when possible. Do not maintain Vercel runtime env manually; bootstrap/deploy syncs it from the resolved environment.

Runtime variables are compared with keyed fingerprints inside `vercel env run`, so unchanged values are not rewritten and sensitive values are never printed. Deployments are tagged with a source-and-configuration fingerprint; rerunning the same revision with the same resolved runtime configuration reuses the existing ready deployment.

## 5. Choose the first-time path

### Path A: deploy first and let CI provision Stripe

This path minimizes manual secret handling and is the simplest way to bring up `development`.

1. Complete Terraform and the operator-supplied environment values above.
2. Push a non-`main` branch to start **Deploy development**.
3. The reusable deploy validates the resolved environment, checks migrations, pushes hosted migrations, creates/reconciles the Stripe webhook, syncs runtime env to Vercel, deploys, and smoke-tests the result.
4. Run **Configure Providers** with `mode=plan`, then `mode=apply`, after the endpoint exists. This enables hosted Supabase Google Auth and explicitly reconciles provider settings.

**Bootstrap Environment** is not required on this path. Do not run it unless `STRIPE_WEBHOOK_SECRET` is also available in the selected GitHub Environment; that workflow does not inject the Vercel-stored signing secret.

For a production launch, prefer the bootstrap-before-deploy path below so OAuth and provider settings can be verified before the release tag is cut.

### Path B: bootstrap before the first deploy

1. Pre-provision the Stripe endpoint locally and store `STRIPE_WEBHOOK_SECRET` as described above.
2. Run **Configure Providers** with `mode=plan` for the target environment.
3. Run **Configure Providers** with `mode=apply`. The workflow can update or verify an existing Stripe endpoint, but it intentionally cannot create the first endpoint because that command does not persist Stripe's one-time secret.
4. Run **Bootstrap Environment** for the target environment.
5. Repeat for the other active environment.

`Bootstrap Environment` delegates to `scripts/bootstrap-environment.mjs`, which applies configured providers, validates the resolved environment, generates `.env.deploy`, syncs Vercel env, links Supabase, pushes migrations, and removes `.env.deploy`. It does not deploy the app.

## 6. Deploy

Development deploys automatically from non-`main` branches unless the change is docs-only. The caller skips cleanly until the three shared deployment secrets exist.

Production deploys from a published release or `v*` tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Production should pause for GitHub Environment reviewer approval before mutable jobs run.

All workflows that mutate a hosted environment share the same per-environment concurrency lock. Terraform, provider reconciliation, bootstrap, and deployment therefore run serially rather than racing each other.

## 7. Verify

After deploy:

- `/api/health` returns HTTP 200.
- Production `/api/health?deep=1` returns HTTP 200.
- Google sign-in redirects through `/auth/callback` successfully after **Configure Providers** has applied the hosted provider settings.
- PayNow test-mode checkout works in `development` before live sales.
- Re-running the same deploy reports unchanged Vercel environment values and reuses the ready deployment when source and resolved config are unchanged.

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
3. Move `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `GOOGLE_OAUTH_CLIENT_ID` to environment variables when they are operator supplied.
4. Keep `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, and `GOOGLE_OAUTH_CLIENT_SECRET` as environment secrets. Existing `STRIPE_WEBHOOK_SECRET` values remain valid; deploy can provision and persist the value to Vercel when absent.
5. Remove manually copied `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` from GitHub Environments after the resolver succeeds.
6. Choose either deploy-first or bootstrap-before-deploy for each active environment, then verify provider settings and health checks.
