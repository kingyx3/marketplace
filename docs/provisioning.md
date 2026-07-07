# Provisioning and infrastructure as code

## Current production model

GitHub Environments are the source of truth for this repo's deployed config.
Each long-lived environment has its own downstream projects:

| GitHub Environment | Vercel project | Supabase project |
| --- | --- | --- |
| `development` | dedicated development project | dedicated development project or local CLI |
| `staging` | dedicated staging project | dedicated staging project |
| `production` | dedicated production project | dedicated production project |

The manual **Bootstrap Environment** workflow reconciles an environment after the
provider projects and GitHub Environment values exist. It validates the GitHub
contract, syncs runtime env to Vercel, links the Supabase project, pushes
migrations, deploys, and smoke tests.

## What is code-managed today

- Next.js/Vercel build and headers through `vercel.json`.
- Runtime env contract through `.env.example`, `scripts/generate-env.mjs`, and
  `lib/env.ts`.
- Vercel runtime env reconciliation through `scripts/sync-vercel-env.mjs`.
- Supabase schema, RLS, storage bucket, grants, and seed data through
  `supabase/migrations` and `supabase/seed.sql`.
- Deployment wiring through `.github/workflows/deploy*.yml` and
  `.github/workflows/bootstrap-environment.yml`.

## Terraform option

Vercel and Supabase both have Terraform providers. Use Terraform if you want
provider projects, domains, and selected provider settings to be reviewed and
applied as code.

Recommended boundary:

- Terraform may create/import Vercel projects, Vercel domains, Supabase projects,
  and non-secret provider settings.
- GitHub Environments remain the source of truth for runtime values used by this
  app, especially secrets.
- Avoid putting sensitive runtime values directly into Terraform state unless you
  have a remote encrypted state backend and strict access controls.
- Database schema still belongs in Supabase migrations, not Terraform.

A later Terraform layout can look like:

```text
infra/
  terraform/
    modules/
      vercel-project/
      supabase-project/
    environments/
      development/
      staging/
      production/
```

Use import first for existing projects, then let Terraform manage only resources
that are safe and useful to reconcile as code. Do not duplicate ownership: if
Terraform manages a Vercel environment variable, remove it from the GitHub-owned
sync contract, and vice versa.

## Bootstrap checklist

For each environment:

1. Create or import the Vercel project.
2. Create or import the Supabase project.
3. Configure dashboard-only provider settings such as Supabase Auth redirect
   URLs and Stripe webhook endpoints.
4. Set the matching GitHub Environment variables and secrets from
   `docs/environments.md`.
5. Run **Bootstrap Environment** in GitHub Actions.
6. Confirm `/api/health` and, for staging/production, `/api/health?deep=1`.
