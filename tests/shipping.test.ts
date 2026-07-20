import { describe, expect, it } from "vitest";
import { quoteShipping } from "@/lib/shipping";

const address = {
  recipientName: "Buyer",
  line1: "1 Market Street",
  city: "Singapore",
  postalCode: "048940",
  countryCode: "SG",
};

describe("shipping policy", () => {
  it("quotes an active Singapore policy", async () => {
    await expect(
      quoteShipping(fakeSupabase(["SG"]) as never, address, 19900, "SGD")
    ).resolves.toEqual({
      shippingCents: 800,
      serviceName: "Tracked delivery",
      policyKey: "shipping_policy",
    });
  });

  it("rejects non-Singapore destinations before querying a rate", async () => {
    await expect(
      quoteShipping({} as never, { ...address, countryCode: "MY" }, 19900, "SGD")
    ).rejects.toThrow("Shipping is currently available only within Singapore");
  });

  it("rejects a policy that attempts to enable unsupported tax jurisdictions", async () => {
    await expect(
      quoteShipping(fakeSupabase(["SG", "MY"]) as never, address, 19900, "SGD")
    ).rejects.toThrow("Shipping checkout is not configured");
  });
});

function fakeSupabase(supportedCountryCodes: string[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: {
        active: true,
        value: {
          enabled: true,
          currency: "SGD",
          supportedCountryCodes,
          flatRateCents: 800,
          freeShippingThresholdCents: null,
          serviceName: "Tracked delivery",
        },
      },
      error: null,
    }),
  };

  return { from: () => builder };
}
