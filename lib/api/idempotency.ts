import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { badRequest, conflict, serviceUnavailable } from "@/lib/api/errors";
import { logError } from "@/lib/observability";

const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

interface ClaimResult {
  claim_state: "claimed" | "replay" | "conflict" | "in_progress";
  stored_response_status: number | null;
  stored_response_body: unknown;
}

export interface IdempotentOperationOptions {
  scope: string;
  actorId: string;
  key: string;
  requestBody: unknown;
  requestId?: string;
  ttlSeconds?: number;
}

export interface IdempotentOperationResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw badRequest(
      "A valid Idempotency-Key header is required for this duplicate-sensitive operation"
    );
  }
  return key;
}

export async function runIdempotentJsonOperation<T>(
  supabase: SupabaseClient,
  options: IdempotentOperationOptions,
  operation: () => Promise<{ status: number; body: T }>
): Promise<IdempotentOperationResult<T>> {
  assertScope(options.scope);
  const idempotencyKeyHash = sha256(options.key);
  const requestHash = sha256(stableJson(options.requestBody));
  const rpcContext = {
    p_scope: options.scope,
    p_actor_id: options.actorId,
    p_idempotency_key_hash: idempotencyKeyHash,
    p_request_hash: requestHash,
  };

  const claim = await supabase
    .rpc("claim_api_idempotency", {
      ...rpcContext,
      p_ttl_seconds: options.ttlSeconds ?? 60 * 60,
    })
    .single();

  if (claim.error || !claim.data) {
    logError("api.idempotency.claim_failed", claim.error ?? new Error("Empty claim result"), {
      requestId: options.requestId,
      scope: options.scope,
      actorId: options.actorId,
    });
    throw serviceUnavailable("Request deduplication is temporarily unavailable");
  }

  const claimResult = claim.data as ClaimResult;
  if (claimResult.claim_state === "conflict") {
    throw conflict("The idempotency key was already used for a different request");
  }
  if (claimResult.claim_state === "in_progress") {
    throw conflict("An identical request is already being processed");
  }
  if (claimResult.claim_state === "replay") {
    if (!claimResult.stored_response_status || claimResult.stored_response_body === null) {
      throw serviceUnavailable("The stored idempotent response is unavailable");
    }
    return {
      status: claimResult.stored_response_status,
      body: claimResult.stored_response_body as T,
      replayed: true,
    };
  }

  try {
    const result = await operation();
    const completed = await supabase.rpc("complete_api_idempotency", {
      ...rpcContext,
      p_response_status: result.status,
      p_response_body: result.body,
    });
    if (completed.error) {
      logError("api.idempotency.complete_failed", completed.error, {
        requestId: options.requestId,
        scope: options.scope,
        actorId: options.actorId,
      });
      throw serviceUnavailable("The request completed but its replay record could not be saved");
    }
    return { ...result, replayed: false };
  } catch (error) {
    const released = await supabase.rpc("release_api_idempotency", rpcContext);
    if (released.error) {
      logError("api.idempotency.release_failed", released.error, {
        requestId: options.requestId,
        scope: options.scope,
        actorId: options.actorId,
      });
    }
    throw error;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortValue(entry)])
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertScope(scope: string): void {
  if (!/^[a-z0-9._:-]{2,100}$/i.test(scope)) {
    throw new Error("Invalid idempotency scope");
  }
}
