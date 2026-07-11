# Observability and alerting

The application emits structured JSON logs for critical checkout, invoice, Stripe webhook, admin credit, scheduled-expiry, and API-error events. Every correlated response includes `x-request-id`; middleware propagates a valid upstream request ID or creates one.

The repository logging layer is a foundation, not a complete monitoring service. Production still requires a log destination, metrics/alert provider, ownership, and tested notifications.

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

## Correlation procedure

For a reported API failure:

1. Capture the `x-request-id` response header from the browser/network trace or support report.
2. Search the production log destination for that exact request ID.
3. Identify the stable event name and related safe identifiers.
4. Follow the order/payment/webhook identifiers through subsequent records and database audit entries.
5. Do not ask a customer to send bearer tokens, cookies, Stripe secrets, or full payment payloads.

Stripe webhook requests generate their own correlation ID because the webhook route bypasses authentication middleware. The Stripe event ID is logged separately after signature verification.

## Required production dashboards

Create dashboards for at least:

- checkout creation success/error rate and latency;
- invoice checkout success/rejection rate, including credit-limit and policy failures;
- Stripe webhook received, duplicate, invalid-signature, storage-failure, and processing-failure counts;
- payment exceptions by age and reason;
- pending Stripe payments older than the expected confirmation window;
- pending manual invoices approaching allocation expiry;
- hourly invoice-expiry job success, duration, and expired-order count;
- deep readiness status;
- database connection, CPU, storage, and API saturation;
- application 5xx rate and latency by route.

## Minimum alerts

Alerts must identify an owner and escalation target. Recommended initial conditions:

- any Stripe webhook storage or processing failure;
- webhook invalid-signature rate above an agreed abuse threshold;
- no successful invoice-expiry cron execution for two scheduled intervals;
- checkout 5xx rate above 1% for five minutes;
- payment exception older than 15 minutes for Stripe or 24 hours for manual invoice;
- deep readiness failure for two consecutive checks;
- database storage or connection use above 80%;
- backup/PITR failure or missed backup window;
- restore drill overdue.

Tune thresholds with production traffic; do not suppress an alert merely because it is noisy without correcting the underlying signal or workflow.

## External provider integration

Connect Vercel logs or an approved collector to an error/observability platform. The provider should support:

- JSON field parsing;
- retention appropriate for operational and privacy requirements;
- request-ID search;
- dashboards and alert routing;
- access controls and audit logs;
- redaction or ingestion filters;
- regional/data-processing requirements.

Do not send raw Stripe webhook payloads, credentials, customer addresses, or authorization headers to the provider.

## Smoke tests

Before launch and after observability changes:

1. Send a request with a known valid `x-request-id`; verify the response and log retain it.
2. Send an invalid request; verify the error response is correlated and the log contains no submitted personal data.
3. Deliver a signed Stripe test webhook; verify received/processed events and event ID correlation.
4. Trigger a controlled webhook handler failure in a non-production environment and verify alert delivery.
5. Run the invoice-expiry route with the cron bearer secret and verify a completion event.
6. Attempt the cron route without the secret and verify a warning without exposing the expected value.
7. Confirm alert delivery reaches the designated operator and escalation path.

## Incident fields

An incident record should capture:

- start/detection/recovery times;
- request IDs and provider event IDs;
- affected order/payment IDs;
- customer impact without unnecessary personal information;
- current mitigation;
- reconciliation status;
- recovery/rollback choice;
- alert effectiveness;
- follow-up owner and deadline.

## Residual limitations

Repository CI validates correlation, response headers, and redaction helpers. It cannot verify production log ingestion, retention, dashboards, alert routing, or on-call response. Those remain deployment gates until demonstrated in the selected production environment.
