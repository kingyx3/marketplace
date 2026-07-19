# Application API architecture

## Purpose

All browser-visible application data flows cross a same-origin server boundary before reaching Supabase/PostgreSQL. Client Components may use the Supabase browser SDK only to establish or read the authenticated session token. They must not query tables, call database RPCs, use Storage as an application data store, or import server database clients.

The database remains protected by constraints and Row Level Security as defence in depth. API authentication and authorization remain mandatory even when an RLS policy would also reject the request.

## Directory boundaries

| Boundary | Location | Responsibility |
| --- | --- | --- |
| Controllers | `app/api/**/route.ts` | HTTP method, route contract, authentication, authorization, request limits, and response status only |
| Server actions | `app/actions/*.ts` | Trusted form/RSC entry points; authenticate and delegate to application services |
| Shared API contracts | `lib/api/contracts.ts` | Browser-safe request, response, and error types |
| Frontend API client | `lib/api/client.ts` | Same-origin requests, bearer tokens, request IDs, timeouts, safe retries, error normalization, and idempotency headers |
| Browser session adapter | `lib/auth/browser-session.ts` | Session establishment/token lookup only; it exposes no database methods |
| Handler infrastructure | `lib/api/handler.ts` | Correlation IDs, duration/status logging, timeouts, safe failures, and security headers |
| Authentication and authorization | `lib/api/auth.ts`, `lib/control-permissions.ts` | Token validation, customer identity, active staff lookup, role and permission checks |
| Request parsing | `lib/api/request.ts` | Media-type enforcement and bounded JSON parsing |
| Error contracts | `lib/api/errors.ts` | Stable codes, safe messages, retryability, field errors, request IDs, and `Retry-After` |
| Abuse protection | `lib/api/rate-limit.ts` | Durable, hashed-identity rate-limit buckets |
| Duplicate protection | `lib/api/idempotency.ts` | Atomic request claims, request hashing, replay, conflict detection, and completion records |
| Application services | focused `lib/*.ts` modules | Business rules and workflow orchestration, independent of React and HTTP |
| Data access | server-only application/repository modules using `SupabaseClient` | Explicit selects and mutations, minimal returned fields, RPC calls, and provider persistence |
| Database invariants | `supabase/migrations/*.sql` | Constraints, unique indexes, RLS, atomic inventory/order RPCs, locks, and transactional state transitions |

`lib/supabase.ts` is server-only. Its secret client bypasses RLS and may be used only after API-layer authentication/authorization or in trusted jobs and verified webhooks. Never import it into a Client Component.

## Browser request flow

1. A Client Component obtains an access token through `createBrowserSessionProvider`. This adapter only calls `auth.getSession()`.
2. The component calls `createApiClient().request()` with a same-origin `/api/...` path.
3. The client adds `Authorization`, `x-request-id`, JSON headers, and an optional `Idempotency-Key`.
4. The route executes through `withApiHandler`, which applies a server timeout, produces structured completion logs, attaches the correlation ID, and converts failures to the shared error contract.
5. A protected route calls `authenticateApiRequest`, `requireApiCustomer`, `requireApiAdmin`, or `requireApiPermission` before accessing application data.
6. Zod parses an explicitly defined input schema. Unknown or privileged fields are not passed through to database mutations.
7. The route delegates to an application service. Controllers do not duplicate business rules.
8. The service uses a server-only Supabase client or repository function. Critical multi-record workflows use database RPCs/transactions and provider idempotency.
9. The route returns a deliberately shaped response containing only fields needed by the workflow.

Server Components and server actions may call application services directly because they execute in the trusted server runtime. They must not move business rules into React components, and Client Components must never receive a database client.

## Authentication and authorization

- Every protected API request validates the bearer token server-side with Supabase Auth.
- Customer routes resolve the authenticated user to one active customer record. Ownership is passed explicitly into service queries.
- Administrative routes resolve active staff through `resolveAdminStaff` and enforce a named `ControlPermission` with `requireApiPermission`.
- `/control` visibility is not an authorization control. Hidden links and frontend role checks are usability features only.
- Authorization roles come from trusted app metadata and the active staff record, not editable user metadata.
- Service-role access is never evidence that a request is authorized; authorization must be completed before privileged data access.
- RLS and database grants remain enabled as a second boundary.

## Request validation and limits

- JSON endpoints must use `Content-Type: application/json`.
- `readJsonBody` rejects malformed, empty, unsupported, and oversized request bodies before schema validation.
- Each endpoint supplies a workflow-appropriate maximum body size rather than relying only on platform defaults.
- Zod schemas define accepted fields. Do not spread arbitrary request bodies into inserts or updates.
- Identifiers, pagination, filters, sort fields, file metadata, and provider payloads must have explicit limits and allowlists.
- Default pagination should be bounded and cursor-based for large collections. Never expose an unbounded administrative listing.
- Upload endpoints must validate content type, extension, size, and ownership on the server.

## Error contract

API failures use this stable shape:

```json
{
  "error": {
    "code": "conflict",
    "message": "The request conflicts with the latest data.",
    "requestId": "2cf1d3e0-ef8f-4e27-a1d5-30e8a5054b1f",
    "retryable": false,
    "fields": [
      { "path": "items.0.quantity", "message": "Must be at least 1" }
    ]
  }
}
```

`fields` is present only for validation errors. Messages must be safe for customers. SQL text, provider secrets, stack traces, table names, internal hints, and raw personal data are never returned.

The response and `x-request-id` header contain the same correlation ID. Support can search structured logs and Sentry with that ID. A `429` response also includes `Retry-After`. Retryable errors are limited to transient conditions such as rate limits, gateway timeouts, and temporary service unavailability.

## Logging and Sentry

`withApiHandler` records endpoint, method, request ID, authenticated actor ID when available, status, and duration. Application services add safe workflow identifiers such as order, preorder, or payment record IDs.

The existing telemetry sanitizer redacts tokens, authorization headers, email addresses, phone numbers, client secrets, and other sensitive values before console or Sentry emission. Do not log request bodies or provider payloads by default.

Unhandled API failures are captured by Sentry through `toErrorResponse`. Expected 4xx rejections are warning events rather than exception captures.

## Rate limiting

`api_rate_limit_buckets` stores fixed-window counters. Bucket identifiers are SHA-256 hashes; raw customer IDs, emails, IP addresses, and tokens are not stored in bucket keys.

Sensitive or expensive endpoints call `enforceRateLimit` after authentication so limits can use a stable actor. The default is fail-closed: if durable rate limiting is unavailable, protected financial or inventory operations return a temporary service failure rather than running unprotected.

Choose a scope per operation, not per route collection, for example `checkout.create` or `waitlist.join`. Limits must reflect provider cost, business risk, and normal user behavior.

## Idempotency

Duplicate-sensitive operations require an `Idempotency-Key` header. The browser API client only retries a non-idempotent HTTP method when this header is present.

`api_idempotency_records` stores:

- operation scope;
- authenticated actor ID;
- SHA-256 hash of the key;
- deterministic request-body hash;
- processing/completed state;
- safe JSON response for replay;
- bounded expiry.

The claim RPC atomically returns one of:

- `claimed`: run the operation;
- `replay`: return the stored response without running the operation;
- `conflict`: the key was reused with different input;
- `in_progress`: an identical request is already executing.

If the business operation fails, its claim is released so a corrected retry may proceed. If the business side effect succeeds but saving the replay record fails, the claim remains locked. Releasing it in that state could duplicate a payment, reservation, refund, order, or allocation.

Provider calls still use provider-native idempotency keys. API idempotency protects the application entry point; it does not replace Stripe idempotency or database uniqueness constraints.

## Transactions and concurrency

Critical invariants belong in the database:

- order creation and inventory reservation use atomic database functions;
- stock checks and decrements occur in the same transaction with row locking or atomic conditional updates;
- unique indexes prevent duplicate slugs, SKUs, provider IDs, and idempotency claims;
- reservation expiry and explicit cancellation release inventory through authoritative database functions;
- Stripe webhooks reconcile final provider state and use unique provider event/payment identifiers;
- preorder allocation and refund differences must be recorded transactionally before or alongside provider execution, with reconciliation for partial provider failures.

Do not implement read-check-write inventory logic in a React component or as independent API queries. Do not retry a transaction or external call unless the operation is idempotent and the failure is known to be transient.

## Adding an endpoint

1. Define the browser-safe request and response types.
2. Add or reuse a strict Zod schema with explicit accepted fields.
3. Create a focused application service; keep React and `NextResponse` out of it.
4. Add repository/data-access functions when query logic is reusable or non-trivial.
5. Wrap the route with `withApiHandler`.
6. Authenticate and enforce ownership or a named control permission before data access.
7. Apply request-size, pagination, timeout, rate-limit, and idempotency rules appropriate to the operation.
8. Return only required fields and a deliberate HTTP status.
9. Add unit tests for validation/business rules, route integration tests for auth/error contracts, and concurrency or migration tests for critical invariants.
10. Run the full validation suite and update this document when introducing a new architectural pattern.

## Testing and enforcement

`tests/api-architecture.test.ts` fails CI when a Client Component imports the server Supabase module, imports a general Supabase database client, constructs a browser database client outside the session adapter, or performs direct Supabase data operations.

`tests/api-protections.test.ts` covers bounded JSON input and idempotency success, replay, operation failure, and completion failure behavior. `tests/api-protection-migrations.test.ts` verifies private service-role access and atomic database functions. Existing commerce, checkout, allocation, preorder, refund, authorization, and control-console suites continue to cover business behavior.

Run locally:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

For database verification, reset a clean local Supabase database and run SQL contracts:

```bash
npx supabase db reset
```

## Prohibited patterns

- Supabase `.from()`, `.rpc()`, or application Storage access in Client Components.
- `createBrowserClient` outside the session adapter.
- service-role or secret keys in `NEXT_PUBLIC_*`, browser bundles, logs, or responses.
- trusting hidden controls, route names, or client-provided roles for authorization.
- spreading request bodies into inserts/updates.
- returning raw Supabase, PostgreSQL, Stripe, or Sentry errors.
- performing financial or inventory side effects without idempotency and authoritative concurrency controls.
- duplicating the same business rule in a route, server action, React component, and database function.
