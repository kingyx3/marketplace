"use client";

import { isApiErrorPayload, type ApiFieldError } from "@/lib/api/contracts";

const defaultTimeoutMs = 15_000;
const retryableStatuses = new Set([429, 502, 503, 504]);
const naturallyIdempotentMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly fields: ApiFieldError[];

  constructor(options: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    retryable?: boolean;
    fields?: ApiFieldError[];
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.retryable = options.retryable ?? false;
    this.fields = options.fields ?? [];
  }
}

export interface ApiClientOptions {
  getAccessToken?: () => Promise<string | null>;
  onUnauthorized?: () => void;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  retry?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    async request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
      assertApiPath(path);

      const method = (requestOptions.method ?? "GET").toUpperCase();
      const requestId = requestOptions.requestId ?? createRequestId();
      const canRetry =
        naturallyIdempotentMethods.has(method) || Boolean(requestOptions.idempotencyKey);
      const attempts = requestOptions.retry === false || !canRetry ? 1 : 2;
      let finalError: unknown;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const response = await executeRequest(fetchImplementation, path, method, requestId, {
            ...requestOptions,
            timeoutMs: requestOptions.timeoutMs ?? options.timeoutMs ?? defaultTimeoutMs,
            getAccessToken: options.getAccessToken,
          });

          if (response.status === 401) options.onUnauthorized?.();

          const payload = await readResponsePayload(response);
          if (!response.ok) {
            const error = normalizeApiError(response, payload, requestId);
            if (attempt < attempts && error.retryable) {
              await delay(100 * attempt);
              continue;
            }
            throw error;
          }

          return payload as T;
        } catch (error) {
          finalError = normalizeTransportError(error, requestId);
          if (attempt < attempts && finalError instanceof ApiClientError && finalError.retryable) {
            await delay(100 * attempt);
            continue;
          }
          throw finalError;
        }
      }

      throw normalizeTransportError(finalError, requestId);
    },
  };
}

async function executeRequest(
  fetchImplementation: typeof fetch,
  path: string,
  method: string,
  requestId: string,
  options: ApiRequestOptions & {
    timeoutMs: number;
    getAccessToken?: () => Promise<string | null>;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("request_timeout"), options.timeoutMs);
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const token = await options.getAccessToken?.();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("x-request-id", requestId);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

    let body: BodyInit | undefined;
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    return await fetchImplementation(path, {
      method,
      headers,
      body,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  return await response.json().catch(() => undefined);
}

function normalizeApiError(
  response: Response,
  payload: unknown,
  fallbackRequestId: string
): ApiClientError {
  if (isApiErrorPayload(payload)) {
    return new ApiClientError({
      status: response.status,
      code: payload.error.code,
      message: payload.error.message,
      requestId: payload.error.requestId,
      retryable: payload.error.retryable,
      fields: payload.error.fields,
    });
  }

  return new ApiClientError({
    status: response.status,
    code: response.status === 401 ? "unauthorized" : "request_failed",
    message: userSafeFallback(response.status),
    requestId: response.headers.get("x-request-id") ?? fallbackRequestId,
    retryable: retryableStatuses.has(response.status),
  });
}

function normalizeTransportError(error: unknown, requestId: string): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiClientError({
      status: 0,
      code: "request_timeout",
      message: "The request timed out. Please try again.",
      requestId,
      retryable: true,
    });
  }

  return new ApiClientError({
    status: 0,
    code: "network_error",
    message: "The service could not be reached. Please try again.",
    requestId,
    retryable: true,
  });
}

function userSafeFallback(status: number): string {
  if (status === 401) return "Sign in is required.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested resource was not found.";
  if (status === 409) return "The request conflicts with the latest data. Refresh and try again.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  return status >= 500
    ? "The service is temporarily unavailable."
    : "The request could not be completed.";
}

function assertApiPath(path: string): void {
  if (!path.startsWith("/api/")) {
    throw new Error("Frontend data requests must use same-origin /api endpoints");
  }
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
