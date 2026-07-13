# Sentry observability

The application uses `@sentry/nextjs` across browser, Node.js, and Edge runtimes. The integration captures unhandled application failures, handled server errors emitted through `lib/observability.ts`, performance traces, privacy-masked browser replays, structured logs, release source maps, and pseudonymous user impact.

## Provisioning

Create one Sentry Next.js project for the marketplace, then configure these values in each GitHub Environment (`development`, `staging`, and `production`). Production deployment validation requires the DSN, environment, organization, project, and auth token.

| GitHub Environment value | Kind | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Variable | Public project DSN used by every runtime |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Variable | `development`, `staging`, or `production` |
| `SENTRY_ORG` | Variable | Organization slug for release artifacts |
| `SENTRY_PROJECT` | Variable | Project slug for release artifacts |
| `SENTRY_AUTH_TOKEN` | Secret | Project-scoped release/source-map upload token |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Variable | Optional trace rate; defaults to `0.1` |
| `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | Variable | Optional normal-session replay rate; defaults to `0.02` |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | Variable | Optional error-session replay rate; defaults to `1` |

Use a Sentry organization token restricted to the target organization and project with only the permissions needed to create releases and upload source maps. Never use a personal token or commit the token to the repository.

The existing GitHub bootstrap command can converge these values. Supply prefixed environment inputs, for example `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN`, `PRODUCTION_SENTRY_ORG`, `PRODUCTION_SENTRY_PROJECT`, and `PRODUCTION_SENTRY_AUTH_TOKEN`, then run:

```bash
npm run bootstrap:github:apply -- --target production
```

The deployment workflow passes the environment-scoped values into the runtime reconciliation process. Vercel receives them before building, allowing the Sentry Next.js plugin to upload readable source maps for the exact deployed revision.

## Data handling

The SDK is configured with `sendDefaultPii: false`. Browser replay masks all text and inputs and blocks media. Before events leave the application, the shared scrubber removes request bodies, cookies, query strings, authorization-like headers, credentials, contact details, payment-related fields, and other sensitive keys. Only a pseudonymous user ID is attached for impact analysis; names and email addresses are not sent.

The `/monitoring` tunnel keeps browser telemetry reliable when client-side blockers reject direct Sentry requests. It is excluded from authentication middleware and should not be reused for application traffic.

## Verification

After deploying to staging:

1. Confirm the Vercel build log reports a successful Sentry source-map upload and does not print the auth token.
2. Trigger a controlled exception from a temporary staging-only code path, then remove that code immediately after verification.
3. Confirm the issue shows the correct `staging` environment, deployed commit/release, readable original TypeScript stack frames, browser or server runtime tag, and request/user correlation where applicable.
4. Confirm a normal navigation produces a trace and that an error session produces a privacy-masked replay.
5. Confirm the application error page exposes no exception details and only displays Next.js's safe server digest when one is available.

Do not add a permanently reachable endpoint that throws errors. Use the Sentry project alert rules to page the operational channel for new production regressions, elevated error volume, and checkout/payment failures.

## Tuning

Start with 10% performance tracing, 2% normal-session replay, and 100% replay-on-error. Review event volume and retention after normal production traffic is established. Raise sampling temporarily during an incident through environment variables, then restore the baseline after diagnosis. Error events are not sampled by these trace/replay settings.
