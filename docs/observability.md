# Observability and alerting

The application uses `@sentry/nextjs` as its production error, performance, replay, and application-log platform. It also emits structured JSON logs for critical checkout, invoice, Stripe webhook, admin credit, scheduled-expiry, and API-error events. Every correlated response includes `x-request-id`; middleware propagates a valid upstream request ID or creates one.

Sentry is integrated with the existing logging and error-handling layer rather than added as isolated calls. Browser and React failures, App Router render errors, Node.js and Edge requests, API routes, middleware, server actions, cron routes, Stripe webhooks, handled 5xx errors, and structured operational logs share the same environment, release, request ID, and privacy controls.

## Sentry configuration

The GitHub configuration is intentionally minimal.

Per-environment runtime value:

- `NEXT_PUBLIC_SENTRY_DSN` — GitHub Environment variable containing the project DSN used by browser, Node.js, and Edge runtimes.

Shared build values:

- `SENTRY_ORG` — repository variable containing the Sentry organization slug.
- `SENTRY_PROJECT` — repository variable containing the Sentry project slug.
- `SENTRY_AUTH_TOKEN` — repository secret containing a scoped build token for release creation and source-map upload.

The DSN is the only Sentry runtime setting and is not a credential. The shared organization/project identifiers and token are not duplicated across environments. They are optional for local and development work but required by bootstrap for staging and production so deployed errors have readable source-mapped stack traces.

Environment names come from Vercel/target metadata and releases use the Vercel Git commit SHA. Code defaults are:

- non-production browser/server traces: `1.0`;
- production browser/server traces: `0.1`;
- background session replay: `0`;
- replay on error: `1.0`.

If the DSN is absent, the SDK stays disabled. If only the DSN is present, runtime capture works, but release/source-map upload is unavailable. Never expose `SENTRY_AUTH_TOKEN` through a `NEXT_PUBLIC_` key.

## Privacy and correlation

Sentry default user-information collection is disabled. Authenticated requests are correlated only with the Supabase user UUID and role tags; email addresses and profile metadata are not sent.

Before events, breadcrumbs, or structured log attributes leave the process, the telemetry layer removes or redacts:

- authorization, cookies, tokens, passwords, signatures, and API/client secrets;
- request bodies, provider payloads, and query strings;
- email addresses, phone numbers, postal addresses, and card/payment fields;
- client IP headers such as `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip`;
- oversized or deeply nested values.

Browser replay masks all text and blocks all media. Every handled API exception includes the existing request ID, route, method, status, safe operational identifiers, environment, and release. Use the response `x-request-id` as the first search key in Sentry.

## Releases and source maps

`next.config.ts` uploads source maps only when the shared `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` settings are available. Uploaded maps are deleted from the deployment output so they are not publicly served. Releases use the Vercel Git commit SHA. Browser envelopes are tunneled through `/monitoring` to reduce event loss from ad blockers.

The build integration also enables App Router, middleware, server-function, React component, and Vercel cron instrumentation. SDK debug logging is tree-shaken from production bundles while Sentry application logs remain enabled.

## Logging contract

Structured records include:

- timestamp;
- severity level;
- stable event name;
- service and environment;
- request ID;
- route and method;
- safe operational identifiers such as order, payment, preorder, webhook event, or staff user ID;
- duration and status where available.

Sensitive key names are recursively redacted, including authorization, cookies, secrets, tokens, passwords, signatures, customer email/phone/address, provider payloads, and card-related fields. Do not add raw request bodies, Stripe objects, customer profiles, or environment values to log context.

`logInfo`, `logWarn`, and `logError` continue to write JSON to the platform log stream and also emit Sentry Logs. `logError` records the original exception with sanitized context, so existing checkout, webhook, cron, alert-delivery, and centralized API failures are captured without duplicating instrumentation at every call site.

## Correlation procedure

For a reported API failure:

1. Capture the `x-request-id` response header from the browser/network trace or support report.
2. Search Sentry Issues and Logs for that exact request ID.
3. Identify the stable event name, route, release, and related safe identifiers.
4. Follow the order/payment/webhook identifiers through subsequent records and database audit entries.
5. Do not ask a customer to send bearer tokens, cookies, Stripe secrets, or full payment payloads.

Stripe webhook requests generate their own correlation ID because the webhook route bypasses authentication middleware. The Stripe event ID is logged separately after signature verification.

## Scheduled invoice expiry

The recurring invoice-allocation expiry job runs inside Supabase Postgres through `pg_cron`. It calls `public.expire_stale_invoice_orders(500)` hourly at minute 7 and does not make an HTTP request or invoke a Supabase Edge Function. This keeps the scheduler on the existing database compute and avoids Vercel Hobby's once-daily Cron Job limit.

The authenticated `/api/cron/invoice-expiry` route remains available for manual release verification and operational recovery. It is not registered as a Vercel Cron Job and should not be used as the primary scheduler. Failures in the route are captured by Sentry; database-only cron execution still requires Supabase cron monitoring and alerting.

## Required production dashboards

Create Sentry dashboards for at least:

- application 5xx rate and latency by route and release;
- checkout creation success/error rate and latency;
- invoice checkout success/rejection rate, including credit-limit and policy failures;
- Stripe webhook received, duplicate, invalid-signature, storage-failure, and processing-failure counts;
- payment exceptions by age and reason;
- pending Stripe payments older than the expected confirmation window;
- pending manual invoices approaching allocation expiry;
- deep readiness status.

Provider dashboards must also cover hourly Supabase invoice-expiry job success, database connection/CPU/storage/API saturation, and backup/PITR health because those signals do not originate entirely inside the Next.js process.

## Minimum alerts

Alerts must identify an owner and escalation target. Recommended initial conditions:

- any Stripe webhook storage or processing failure;
- webhook invalid-signature rate above an agreed abuse threshold;
- no successful Supabase invoice-expiry job execution for two scheduled intervals;
- checkout 5xx rate above 1% for five minutes;
- a new high-severity Sentry regression in production;
- payment exception older than 15 minutes for Stripe or 24 hours for manual invoice;
- deep readiness failure for two consecutive checks;
- database storage or connection use above 80%;
- backup/PITR failure or missed backup window;
- restore drill overdue.

Tune thresholds with production traffic; do not suppress an alert merely because it is noisy without correcting the underlying signal or workflow.

## Access, retention, and ownership

Configure Sentry with least-privilege team access, audited organization membership, retention appropriate for operational and privacy requirements, and the required regional/data-processing settings. The source-map token should be scoped only to the release/project permissions needed by the build and stored as a repository secret.

Do not send raw Stripe webhook payloads, credentials, customer addresses, authorization headers, or full request bodies to Sentry or another provider.

## Smoke tests

Before launch and after observability changes:

1. Deploy an exact commit to development or staging with the core Sentry values configured.
2. Send a request with a known valid `x-request-id`; verify the response, platform JSON log, and Sentry Log retain it.
3. Send an invalid request; verify the correlated response/log contains no submitted personal data.
4. Trigger a controlled application failure in non-production and verify the Sentry event has a readable first-party stack trace, route, environment, release, and request ID.
5. Confirm the Sentry release contains source-map artifacts and no `.map` file is publicly served by the deployment.
6. Deliver a signed Stripe test webhook; verify received/processed events and event ID correlation.
7. Trigger a controlled webhook handler failure in a non-production environment and verify Sentry and operational alert delivery.
8. Confirm `expire-stale-invoice-orders-hourly` is active in Supabase Cron and its latest run succeeded.
9. Run the invoice-expiry route with the cron bearer secret and verify a completion event.
10. Attempt the cron route without the secret and verify a warning without exposing the expected value.

## Incident fields

An incident record should capture:

- start/detection/recovery times;
- Sentry issue/event URL, release, request IDs, and provider event IDs;
- affected order/payment IDs;
- customer impact without unnecessary personal information;
- current mitigation;
- reconciliation status;
- recovery/rollback choice;
- alert effectiveness;
- follow-up owner and deadline.

## Residual limitations

Repository CI validates SDK wiring, configuration generation, correlation, response headers, sampling bounds, and redaction helpers. It cannot prove that a Sentry account/project exists, that credentials are valid, that production ingestion and alert routing work, or that on-call responders act correctly. The staging smoke tests, source-map inspection, dashboards, alert rules, ownership, and incident drills remain release gates until demonstrated in the selected hosted environments.
