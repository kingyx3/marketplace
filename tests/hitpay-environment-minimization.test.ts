import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createHitPayClient } from "@/lib/hitpay";

const repoFile = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("HitPay environment minimization", () => {
  it("keeps only the API key and webhook salt as required HitPay secrets", async () => {
    const contract = JSON.parse(await repoFile("config/environment-contract.json"));
    const hitpay = contract.filter((entry: { section: string }) => entry.section === "HitPay");
    expect(
      hitpay.filter((entry: { required: boolean; secret: boolean }) => entry.required && entry.secret)
        .map((entry: { key: string }) => entry.key)
        .sort()
    ).toEqual(["HITPAY_API_KEY", "HITPAY_WEBHOOK_SALT"]);
    expect(hitpay.find((entry: { key: string }) => entry.key === "HITPAY_API_URL")?.required).toBe(
      false
    );
    expect(
      hitpay.find((entry: { key: string }) => entry.key === "HITPAY_PAYMENT_METHODS")?.required
    ).toBe(false);
    expect(contract.some((entry: { key: string }) => entry.key === "HITPAY_WEBHOOK_ID")).toBe(
      false
    );
    expect(
      contract.some((entry: { key: string }) => entry.key === "HITPAY_WEBHOOK_ENABLED_EVENTS")
    ).toBe(false);
  });

  it("selects sandbox and production API hosts without an explicit URL", async () => {
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          status: "pending",
          amount: "1.00",
          currency: "SGD",
          url: "https://securecheckout.sandbox.hit-pay.com/example",
        })
      );
    };
    try {
      for (const target of ["development", "production"] as const) {
        const client = createHitPayClient({
          HITPAY_API_KEY: "test-key",
          TARGET_ENV: target,
        } as unknown as NodeJS.ProcessEnv);
        await client.createPaymentRequest({
          amountCents: 100,
          currency: "SGD",
          purpose: "Test",
          referenceNumber: `test:${target}`,
          redirectUrl: "https://shop.example/orders",
        });
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(requests[0]).toBe("https://api.sandbox.hit-pay.com/v1/payment-requests");
    expect(requests[1]).toBe("https://api.hit-pay.com/v1/payment-requests");
  });
});
