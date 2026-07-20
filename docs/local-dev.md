# Local development

## Automated first run

Prerequisites:

- Node/npm versions from `.nvmrc` and `package.json`.
- Docker running.

Then:

```bash
nvm use
npm run bootstrap:doctor
npm run bootstrap:local
```

The bootstrap command:

1. Runs `npm ci`.
2. Uses the pinned Supabase CLI version from `config/tool-versions.json`.
3. Starts or reuses local Supabase.
4. Reads machine-readable local URL/keys.
5. Merges them into ignored `.env.local` without overwriting existing HitPay values.
6. Resets migrations and seed data.
7. Reports only missing provider values.

HitPay API keys cannot be recovered automatically. Add test-mode values to `.env.local`. For webhook testing, run the HitPay CLI in another terminal:

```bash
hitpay listen --forward-to localhost:3000/api/webhooks/hitpay
```

Copy its temporary `whsec_...` value into `.env.local`, then run:

```bash
npm run env:check
npm run dev
```

Useful reruns:

```bash
npm run bootstrap:local -- --skip-install
npm run bootstrap:local -- --skip-reset
npx supabase studio
```

Database changes remain forward-only migrations under `supabase/migrations/`.
