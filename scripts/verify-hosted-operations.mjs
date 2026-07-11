#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const appUrl = requiredUrl("STAGING_APP_URL");
const cronSecret = required("CRON_SECRET");
const monitorSecret = required("SYNTHETIC_MONITOR_SECRET");

await verifyHealth("/api/health");
await verifyHealth("/api/health?deep=1");
await verifyProtectedEndpoint("/api/cron/invoice-expiry", "GET", cronSecret, "expiredOrders");
await verifyProtectedEndpoint("/api/observability/test-alert", "POST", monitorSecret, "delivered");

console.log("Hosted readiness, request correlation, cron authentication, and alert delivery checks passed.");

async function verifyHealth(path) {
  const requestId = `release-gate-${randomUUID()}`;
  const response = await retryFetch(new URL(path, appUrl), {
    headers: { Accept: "application/json", "x-request-id": requestId },
  });
  assert(response.status === 200, `${path} returned ${response.status}`);
  assert(response.headers.get("x-request-id") === requestId, `${path} did not preserve request correlation`);
  const body = await response.json();
  assert(body && typeof body === "object", `${path} returned an invalid JSON body`);
  if (path.includes("deep=1")) {
    assert(body.status === "ok", `deep readiness status is ${body.status}`);
  }
}

async function verifyProtectedEndpoint(path, method, secret, expectedKey) {
  const unauthenticated = await fetch(new URL(path, appUrl), {
    method,
    headers: { Authorization: "Bearer deliberately-wrong", Accept: "application/json" },
  });
  assert(unauthenticated.status === 401, `${path} accepted an invalid bearer secret`);

  const requestId = `release-gate-${randomUUID()}`;
  const response = await retryFetch(new URL(path, appUrl), {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      "x-request-id": requestId,
    },
  });
  assert(response.status === 200, `${path} returned ${response.status}`);
  assert(response.headers.get("x-request-id") === requestId, `${path} did not preserve request correlation`);
  const body = await response.json();
  assert(Object.hasOwn(body, expectedKey), `${path} response is missing ${expectedKey}`);
  if (expectedKey === "delivered") assert(body.delivered === true, "alert delivery probe did not confirm delivery");
}

async function retryFetch(url, init) {
  let lastResponse;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      lastResponse = await fetch(url, { ...init, cache: "no-store" });
      if (lastResponse.status < 500) return lastResponse;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error(`Could not reach ${url}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function requiredUrl(name) {
  try {
    return new URL(required(name));
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
