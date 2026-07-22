import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { requireIdempotencyKey, runIdempotentJsonOperation } from "@/lib/api/idempotency";
import { readJsonBody } from "@/lib/api/request";

describe("API request protections", () => {
  it("parses bounded JSON request bodies", async () => {
    const request = new Request("https://example.test/api/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "safe" }),
    });

    await expect(readJsonBody(request, { maxBytes: 1024 })).resolves.toEqual({ value: "safe" });
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    const unsupported = new Request("https://example.test/api/example", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "value",
    });
    const oversized = new Request("https://example.test/api/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100) }),
    });

    await expect(readJsonBody(unsupported)).rejects.toMatchObject({
      status: 415,
      code: "unsupported_media_type",
    });
    await expect(readJsonBody(oversized, { maxBytes: 16 })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("requires a bounded idempotency key", () => {
    expect(
      requireIdempotencyKey(
        new Request("https://example.test/api/checkout", {
          headers: { "idempotency-key": "checkout-12345678" },
        })
      )
    ).toBe("checkout-12345678");

    expect(() => requireIdempotencyKey(new Request("https://example.test/api/checkout"))).toThrow(
      ApiError
    );
  });

  it("stores and replays successful idempotent responses", async () => {
    const operation = vi.fn(async () => ({ status: 201, body: { orderId: "order-1" } }));
    const supabase = mockSupabase([
      { data: { claim_state: "claimed" }, error: null, single: true },
      { data: null, error: null },
    ]);

    await expect(
      runIdempotentJsonOperation(
        supabase.client,
        {
          scope: "checkout.create",
          actorId: "00000000-0000-4000-8000-000000000001",
          key: "checkout-12345678",
          requestBody: { items: [{ productId: "referenceCode-1", quantity: 1 }] },
        },
        operation
      )
    ).resolves.toEqual({
      status: 201,
      body: { orderId: "order-1" },
      replayed: false,
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "complete_api_idempotency",
      expect.objectContaining({ p_response_status: 201 })
    );
  });

  it("does not run the operation when a completed response can be replayed", async () => {
    const operation = vi.fn();
    const supabase = mockSupabase([
      {
        data: {
          claim_state: "replay",
          stored_response_status: 201,
          stored_response_body: { orderId: "order-1" },
        },
        error: null,
        single: true,
      },
    ]);

    await expect(
      runIdempotentJsonOperation(
        supabase.client,
        {
          scope: "checkout.create",
          actorId: "00000000-0000-4000-8000-000000000001",
          key: "checkout-12345678",
          requestBody: { items: [{ productId: "referenceCode-1", quantity: 1 }] },
        },
        operation
      )
    ).resolves.toEqual({
      status: 201,
      body: { orderId: "order-1" },
      replayed: true,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("releases a claim only when the protected operation fails", async () => {
    const supabase = mockSupabase([
      { data: { claim_state: "claimed" }, error: null, single: true },
      { data: null, error: null },
    ]);

    await expect(
      runIdempotentJsonOperation(
        supabase.client,
        {
          scope: "checkout.create",
          actorId: "00000000-0000-4000-8000-000000000001",
          key: "checkout-12345678",
          requestBody: { items: [] },
        },
        async () => {
          throw new Error("operation failed");
        }
      )
    ).rejects.toThrow("operation failed");
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "release_api_idempotency", expect.any(Object));
  });

  it("keeps the claim when completion persistence fails after the side effect", async () => {
    const supabase = mockSupabase([
      { data: { claim_state: "claimed" }, error: null, single: true },
      { data: null, error: { message: "database unavailable" } },
    ]);

    await expect(
      runIdempotentJsonOperation(
        supabase.client,
        {
          scope: "checkout.create",
          actorId: "00000000-0000-4000-8000-000000000001",
          key: "checkout-12345678",
          requestBody: { items: [] },
        },
        async () => ({ status: 201, body: { orderId: "order-1" } })
      )
    ).rejects.toMatchObject({ code: "service_unavailable" });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).not.toHaveBeenCalledWith("release_api_idempotency", expect.any(Object));
  });
});

interface MockRpcResult {
  data: unknown;
  error: unknown;
  single?: boolean;
}

function mockSupabase(results: MockRpcResult[]): {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(() => {
    const result = results.shift();
    if (!result) throw new Error("Unexpected RPC call");
    if (result.single) {
      return {
        single: vi.fn(async () => ({ data: result.data, error: result.error })),
      };
    }
    return Promise.resolve({ data: result.data, error: result.error });
  });

  return { client: { rpc } as unknown as SupabaseClient, rpc };
}
