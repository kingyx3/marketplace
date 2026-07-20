# Observability and alerting

The application uses `@sentry/nextjs` for browser, React/App Router, Node.js, Edge, middleware, API routes, server actions, cron routes, webhooks, performance traces, replay-on-error, structured logs, and handled exceptions. Existing JSON platform logs and `x-request-id` correlation remain intact.

## Minimal Sentry configuration

All deployment targets use one Sentry project and one DSN.

Repository variables:

- `NEXT_PUBLIC_SENTRY_DSN` — shared browser, Node.js, and Edge ingestion DSN.
- `SENTRY_ORG` — Sentry organization slug used for releases and source maps.
- `SENTRY_PROJECT` — Sentry project slug used for releases and source maps.

Repository secret:

- `SENTRY_AUTH_TOKEN` — least-privilege release/source-map upload token.

No Sentry setting is stored separately in the development, staging, or production GitHub Environments. Bootstrap removes environment-scoped Sentry overrides from all three environments so they cannot shadow the repository values.

The deployment command derives `NEXT_PUBLIC_SENTRY_ENVIRONMENT` from the selected target and passes it directly to the Vercel build and runtime. Events in the shared project are therefore separated as:

- `development`
- `staging`
- `production`

Releases use the Vercel Git commit SHA. Runtime capture is disabled when the DSN is absent. Runtime capture still works without the organization, project, or token, but first-party browser stack traces may remain minified because source maps cannot be uploaded.

Default sampling:

- non-production tracing: `1.0`
- production tracing: `0.1`
- background replay: `0`
- replay on error: `1.0`

## Privacy and correlation

Sentry default user-information collection is disabled. Authenticated requests are correlated only with the Supabase user UUID and role tags.

Before telemetry leaves the process, the application removes or redacts:

- authorization headers, cookies, tokens, passwords, signatures, and provider secrets;
- request bodies, provider payloads, and query strings;
- email addresses, phone numbers, postal addresses, IP headers, and payment/card fields;
- oversized or deeply nested values.

Browser replay masks all text and blocks all media. Do not add raw request bodies, HitPay objects, customer profiles, credentials, or full provider payloads to log context.

Every handled API failure includes the request ID, route, method, status, environment, release, and safe operational identifiers. Use `x-request-id` as the first Sentry search key.

## Releases and source maps

`next.config.ts` uploads source maps only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are available. Uploaded maps are removed from deployment output so they are not publicly served. Browser envelopes are tunneled through `/monitoring` to reduce loss from ad blockers.

The build integration enables App Router, middleware, server-function, React component, and Vercel cron instrumentation. SDK debug logging is removed from production bundles while Sentry application logs remain enabled.

## Operational workflow

For a reported API failure:

1. Capture the response `x-request-id`.
2. Search Sentry Issues and Logs for that exact value.
3. Identify the event name, route, environment, release, and safe order/payment/webhook identifiers.
4. Correlate those identifiers with subsequent structured logs and database audit records.
5. Never request customer bearer tokens, cookies, HitPay secrets, or complete payment payloads.

HitPay webhook requests create their own correlation ID because the webhook route bypasses authentication middleware. The HitPay event ID is recorded separately after signature verification.

## Production dashboards and alerts

Create dashboards for application 5xx rate, route latency, checkout outcomes, invoice rejection reasons, HitPay webhook failures, payment exceptions, stale pending payments, manual-invoice allocation expiry, and deep readiness.

Minimum alerts should cover:

- HitPay webhook storage or processing failures;
- checkout 5xx rate above the agreed threshold;
- new high-severity production regressions;
- stale payment exceptions;
- repeated deep-readiness failures;
- missed invoice-expiry executions;
- database connection/storage saturation;
- backup or PITR failures.

Provider dashboards must separately cover Supabase cron execution, database health, and backup status because those signals do not originate entirely inside the Next.js runtime.

## Hosted verification

Before launch and after observability changes:

1. Deploy an exact commit to development or staging with all four shared Sentry settings configured.
2. Trigger a controlled failure and confirm its environment is `development` or `staging`, not `production`.
3. Confirm the event has a readable first-party stack trace, release, route, and request ID.
4. Confirm the Sentry release contains source-map artifacts and no `.map` file is publicly served.
5. Verify submitted personal data and credentials are absent from events and logs.
6. Exercise a signed HitPay test webhook and verify event-ID correlation.
7. Verify invoice-expiry monitoring and operational alert delivery.

Repository CI validates SDK wiring, environment derivation, source-map configuration, sampling bounds, request-ID preservation, and telemetry redaction. It cannot prove hosted credentials, ingestion, alert routing, or responder readiness; those remain release gates.
