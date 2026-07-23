import { describe, expect, it } from "vitest";

import { checkoutReturnUrl } from "@/lib/order-checkout";

const orderId = "11111111-1111-4111-8111-111111111111";
const env = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
} as NodeJS.ProcessEnv;

describe("checkout return URLs", () => {
  it("routes an approved orders return through the public payment result page", () => {
    const result = new URL(checkoutReturnUrl("https://shop.example.com/orders", orderId, undefined, env));

    expect(result.origin).toBe("https://shop.example.com");
    expect(result.pathname).toBe("/checkout/return");
    expect(result.searchParams.get("order")).toBe(orderId);
    expect(result.searchParams.get("destination")).toBe("order");
  });

  it("anchors the provider return to the live checkout request when deployment env is stale", () => {
    const currentOrigin =
      "https://marketplace-4pw03z00j-marketplace-production.vercel.app";
    const previousOrigin =
      "https://marketplace-o7hsjxyt2-marketplace-production.vercel.app";
    const result = new URL(
      checkoutReturnUrl(`${previousOrigin}/orders`, orderId, currentOrigin, {
        ...env,
        NEXT_PUBLIC_SITE_URL: previousOrigin,
        TARGET_ENV: "production",
        VERCEL_URL: "marketplace-o7hsjxyt2-marketplace-production.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "marketplace-production.vercel.app",
      }),
    );

    expect(result.origin).toBe(currentOrigin);
    expect(result.pathname).toBe("/checkout/return");
    expect(result.searchParams.get("destination")).toBe("order");
  });

  it("does not send production returns to an older immutable Vercel deployment", () => {
    const result = new URL(
      checkoutReturnUrl("https://marketplace-current-team.vercel.app/orders", orderId, undefined, {
        ...env,
        NEXT_PUBLIC_SITE_URL: "https://marketplace-o7hsjxyt2-marketplace-production.vercel.app",
        TARGET_ENV: "production",
        VERCEL_URL: "marketplace-current-team.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "marketplace-production.vercel.app",
      })
    );

    expect(result.origin).toBe("https://marketplace-current-team.vercel.app");
    expect(result.pathname).toBe("/checkout/return");
    expect(result.searchParams.get("destination")).toBe("order");
  });

  it("keeps an explicitly configured custom production domain", () => {
    const result = new URL(
      checkoutReturnUrl("https://shop.example.com/orders", orderId, undefined, {
        ...env,
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "marketplace-production.vercel.app",
      })
    );

    expect(result.origin).toBe("https://shop.example.com");
    expect(result.searchParams.get("destination")).toBe("order");
  });

  it("falls back to the stable production URL when the current deployment URL is unavailable", () => {
    const result = new URL(
      checkoutReturnUrl("https://marketplace-production.vercel.app/orders", orderId, undefined, {
        ...env,
        NEXT_PUBLIC_SITE_URL: "https://marketplace-previous-team.vercel.app",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "marketplace-production.vercel.app",
      })
    );

    expect(result.origin).toBe("https://marketplace-production.vercel.app");
    expect(result.searchParams.get("destination")).toBe("order");
  });

  it("routes the standard cart return through the public payment result page", () => {
    const result = new URL(
      checkoutReturnUrl("https://shop.example.com/cart?source=checkout#summary", orderId, undefined, env)
    );

    expect(result.pathname).toBe("/checkout/return");
    expect(result.searchParams.get("order")).toBe(orderId);
    expect(result.searchParams.get("destination")).toBe("cart");
  });

  it.each(["https://attacker.example/orders", "https://shop.example.com/control", "not-a-url"])(
    "falls back to the cart for an untrusted return URL: %s",
    (requestedUrl) => {
      const result = new URL(checkoutReturnUrl(requestedUrl, orderId, undefined, env));

      expect(result.origin).toBe("https://shop.example.com");
      expect(result.pathname).toBe("/checkout/return");
      expect(result.searchParams.get("order")).toBe(orderId);
      expect(result.searchParams.get("destination")).toBe("cart");
    }
  );
});
