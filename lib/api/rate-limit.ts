import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { rateLimited, serviceUnavailable } from "@/lib/api/errors";
import { logError } from "@/lib/observability";

export interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  requestId?: string;
  failureMode?: "closed" | "open";
}

interface RateLimitResult {
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  options: RateLimitOptions
): Promise<{ remaining: number }> {
  assertRateLimitOptions(options);
  const bucketKey = `${options.scope}:${hashIdentifier(options.identifier)}`;
  const { data, error } = await supabase
    .rpc("consume_api_rate_limit", {
      p_bucket_key: bucketKey,
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    })
    .single();

  if (error || !data) {
    logError("api.rate_limit.failed", error ?? new Error("Rate-limit result was empty"), {
      requestId: options.requestId,
      scope: options.scope,
      failureMode: options.failureMode ?? "closed",
    });
    if (options.failureMode === "open") return { remaining: 0 };
    throw serviceUnavailable("Request protection is temporarily unavailable");
  }

  const result = data as RateLimitResult;
  if (!result.allowed) {
    throw rateLimited("Too many requests. Please try again shortly.", result.retry_after_seconds);
  }

  return { remaining: Math.max(0, result.remaining) };
}

function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

function assertRateLimitOptions(options: RateLimitOptions): void {
  if (!/^[a-z0-9._:-]{2,80}$/i.test(options.scope)) {
    throw new Error("Invalid rate-limit scope");
  }
  if (!options.identifier.trim()) {
    throw new Error("Rate-limit identifier is required");
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 10_000) {
    throw new Error("Invalid rate-limit request limit");
  }
  if (
    !Number.isInteger(options.windowSeconds) ||
    options.windowSeconds < 1 ||
    options.windowSeconds > 86_400
  ) {
    throw new Error("Invalid rate-limit window");
  }
}
