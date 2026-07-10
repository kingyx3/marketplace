# Bootstrap guide

This runbook takes blank provider accounts to converged `development` and `production` environments. Every repository-managed operation is designed for safe reruns. A second successful run should either make no changes or apply only detected drift.

## Topology

| GitHub Environment | Trigger | Vercel target | Supabase project |
| --- | --- | --- | --- |
| `development` | `develop` push or manual dispatch | Preview | Development |
| `production` | `v*` tag or published release | Production | Production |

The GCS state bucket, Vercel project, and both Supabase project shells are shared infrastructure. Runtime/provider/database reconciliation is per environment.

## 1. Provider account prerequisites

Create or confirm:

- GitHub repository administration.
- A Google Cloud project and credential with permission to manage the Terraform state bucket.
- A Vercel API token.
- A Supabase access token.
- Stripe test/live keys with PayNow enabled.
- Google OAuth Web clients and consent-screen ownership when Google Auth is enabled.

Google Cloud OAuth-client creation and Stripe account-level PayNow enablement remain provider-account boundaries. Everything below those boundaries is reconciled by repository code.

## 2. Configure GitHub from a trusted shell

Authenticate the GitHub CLI, export the required values, and inspect the plan:

```bash
npm run bootstrap:github
npm run github:governance
```

The local command expects shared values using their normal names:

```text
GCP_TERRAFORM_CREDENTIALS_JSON
VERCEL_TOKEN
SUPABASE_ACCESS_TOKEN
```

Per-environment values use `DEVELOPMENT_` or `PRODUCTION_` prefixes, for example:

```text
DEVELOPMENT_NEXT_PUBLIC_SITE_URL
DEVELOPMENT_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
DEVELOPMENT_GOOGLE_AUTH_ENABLED
DEVELOPMENT_GOOGLE_OAUTH_CLIENT_ID
DEVELOPMENT_STRIPE_SECRET_KEY
DEVELOPMENT_GOOGLE_OAUTH_CLIENT_SECRET
```

`SUPABASE_SECRET_KEY` is optional when the Supabase Management API returns a modern `sb_secret_...` key. `STRIPE_WEBHOOK_SECRET` is optional because hosted bootstrap provisions and persists it. Set `PRODUCTION_REVIEWERS=user1,user2` to configure required reviewers.

Apply the complete GitHub setup in one command:

```bash
npm run bootstrap:github:apply
```

The command reconciles strict `main` protection, required CI checks, one independent approval, stale-review dismissal, resolved conversations, `development` and `production`, deployment branch policies, supplied variables/secrets, and production environment reviewers. Secret values are passed over stdin and never printed.

## 3. Reconcile and apply Terraform state bucket

In **Terraform State Bootstrap**:

1. Run `mode=reconcile` to adopt an existing bucket if necessary.
2. Run `mode=plan`. This mode does not import, remove state, or apply changes.
3. Review the plan and note the Actions run id.
4. Run `mode=apply` with `plan_run_id=<reviewed run id>`.

Apply downloads the exact one-day plan artifact, verifies its stack and source commit, and applies that binary plan. It never silently regenerates a different plan.

## 4. Reconcile and apply the platform stack

Repeat the same sequence in **Terraform Platform**:

1. `mode=reconcile` adopts existing Vercel/Supabase resources and removes only state entries whose remote Supabase project is confirmed deleted.
2. `mode=plan` produces a side-effect-free reviewed plan.
3. `mode=apply` applies the exact artifact using its run id.

Both Terraform workflows use one global shared-infrastructure concurrency lock, regardless of which GitHub Environment supplies credentials. Pull-request CI initializes both stacks without a backend, verifies committed multi-platform provider lockfiles, checks formatting, and runs `terraform validate`.

## 5. Complete provider-account inputs

### Google OAuth

For each enabled environment, configure a Google Web application with:

- JavaScript origin: the canonical `NEXT_PUBLIC_SITE_URL` origin.
- Redirect URI: `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`.

Hosted bootstrap reconciles the Supabase provider enablement, client credentials, site URL, and redirect allow-list. Set `GOOGLE_AUTH_ENABLED=false` to explicitly disable this capability and remove credential requirements.

### Stripe

Use matching publishable/secret keys for test or live mode. PayNow must be enabled at the Stripe account level. The repository-managed webhook is:

```text
${NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe
```

The desired events are versioned in `config/environments.json`. One shared reconciler owns create, update, replacement, metadata, rollback, and verification. If an endpoint exists but its one-time signing secret is unavailable, bootstrap creates a replacement, persists the new credentials, then removes the old endpoint. Failure to persist credentials rolls back the replacement.

## 6. Bootstrap each hosted environment

Run **Bootstrap Environment** with `mode=apply` for `development`, then `production`.

It performs one convergent operation:

```text
resolve Terraform/provider values
→ inject Vercel-stored generated secrets
→ reconcile Stripe webhook
→ reconcile/verify Supabase hosted auth
→ validate generated environment contract
→ fingerprint and sync Vercel runtime values
→ link Supabase
→ push migrations
```

It does not deploy the application. No local Stripe pre-provisioning is required.

After each apply, rerun **Bootstrap Environment** with `mode=verify`. Verification is non-mutating and fails on Terraform drift, provider drift, missing or malformed runtime values, Vercel runtime drift, or unhealthy deployed endpoints. The same gate is available from an authenticated shell as `npm run bootstrap:verify`.

## 7. Deploy

Development follows only the `develop` integration branch so unrelated feature branches do not successively migrate the same shared database. A manual development dispatch remains available.

Production deploys from a `v*` tag or published release and is protected by production environment reviewers.

Deployment reruns reuse an existing ready Vercel deployment when both source revision and resolved runtime fingerprint are unchanged.

## 8. Release gate

Before the first production release and after infrastructure/provider changes:

1. Confirm pull-request CI is green, including both Terraform validation jobs.
2. Obtain the required independent approval.
3. Run development bootstrap in `apply`, then `verify` mode.
4. Exercise Google login and Stripe test-mode PayNow success, failure, and refund flows.
5. Run production bootstrap in `verify` mode after the production reviewer approves access.
6. Publish the release only after the verification run succeeds.

Additional expected checks:

- `/api/health` returns HTTP 200.
- Production `/api/health?deep=1` returns HTTP 200.
- Re-running bootstrap reports converged provider/runtime values.
- Re-running the same deployment reuses the ready deployment.

## Recovery rules

- Run Terraform `reconcile` again after manually created resources must be adopted or a managed Supabase project was deleted.
- Never edit an applied migration; add a forward migration.
- Correct operator values in GitHub Environments and rerun bootstrap.
- Use **Configure Providers** for a plan, explicit repair, or verification outside the aggregate bootstrap.
