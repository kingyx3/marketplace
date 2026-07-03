# Local development

## Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- Docker (for the local Supabase stack)
- Supabase CLI (`npm i -g supabase` or `npx supabase`)

## First run

```bash
npm install
cp .env.example .env
npx supabase start        # boots local Postgres/Auth/Studio in Docker
```

`supabase start` prints local credentials. Put these into `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
TARGET_ENV=development
STRIPE_SECRET_KEY=sk_test_...        # your Stripe TEST key
STRIPE_WEBHOOK_SECRET=whsec_...      # from `stripe listen` (below)
```

Then:

```bash
npx supabase db reset     # applies supabase/migrations/* + seed.sql
npm run dev               # http://localhost:3000 — /catalog shows the seed product
```

## Stripe webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints the `whsec_...` signing secret for `.env`.

## Everyday commands

| Command | Does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run lint` / `typecheck` / `test` | checks (see docs/testing.md) |
| `npm run env:check` | load and validate your local `.env` against the contract |
| `npx supabase db reset` | rebuild DB from migrations + seed |
| `npx supabase migration new <name>` | start a new migration file |
| `npx supabase studio` | DB browser at localhost:54323 |

## Schema changes

Never edit an applied migration. Create a new file with
`npx supabase migration new <name>`, write forward-only SQL (with RLS
for any new table), run `npx supabase db reset`, and update
`docs/data-model.md` in the same PR.
