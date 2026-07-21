import { describe, expect, it } from "vitest";

import { checkoutReturnUrl } from "@/lib/order-checkout";

const orderId = "11111111-1111-4111-8111-111111111111";
const env = {
  NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
} as NodeJS.ProcessEnv;

describe("checkout return URLs", () => {
  it("routes an approved orders return to the newly created order", () => {
    const result = new URL(checkoutReturnUrl("https://shop.example.com/orders", orderId, env));

    expect(result.origin).toBe("https://shop.example.com");
    expect(result.pathname).toBe(`/orders/${orderId}`);
    expect(result.searchParams.get("checkout")).toBe("processing");
    expect(result.searchParams.has("order")).toBe(false);
  });

  it("preserves the standard cart return with its order reference", () => {
    const result = new URL(
      checkoutReturnUrl("https://shop.example.com/cart?source=checkout#summary", orderId, env)
    );

    expect(result.pathname).toBe("/cart");
    expect(result.searchParams.get("source")).toBe("checkout");
    expect(result.searchParams.get("checkout")).toBe("processing");
    expect(result.searchParams.get("order")).toBe(orderId);
    expect(result.hash).toBe("#summary");
  });

  it.each([
    "https://attacker.example/orders",
    "https://shop.example.com/control",
    "not-a-url",
  ])("falls back to the cart for an untrusted return URL: %s", (requestedUrl) => {
    const result = new URL(checkoutReturnUrl(requestedUrl, orderId, env));

    expect(result.origin).toBe("https://shop.example.com");
    expect(result.pathname).toBe("/cart");
    expect(result.searchParams.get("checkout")).toBe("processing");
    expect(result.searchParams.get("order")).toBe(orderId);
  });
});
