import { describe, expect, it } from "vitest";

import { checkoutReturnDestination, checkoutReturnState } from "@/lib/checkout-return";

const orderId = "11111111-1111-4111-8111-111111111111";

describe("checkout return presentation", () => {
  it("shows a successful payment return without requiring authentication", () => {
    expect(checkoutReturnState("completed")).toMatchObject({
      title: "Thank you for your order",
      label: "Payment received",
      tone: "success",
    });
  });

  it("does not claim success for pending or missing provider statuses", () => {
    expect(checkoutReturnState("pending")).toMatchObject({
      label: "Confirmation pending",
      tone: "warning",
    });
    expect(checkoutReturnState(undefined)).toMatchObject({
      label: "Confirmation pending",
      tone: "warning",
    });
  });

  it("links approved order returns to the created order", () => {
    expect(checkoutReturnDestination(orderId, "order")).toEqual({
      href: `/orders/${orderId}?checkout=processing`,
      label: "View order",
    });
  });

  it("falls back to the cart for invalid or unapproved destinations", () => {
    expect(checkoutReturnDestination("not-an-order", "order")).toEqual({
      href: "/cart?checkout=processing",
      label: "Return to cart",
    });
    expect(checkoutReturnDestination(orderId, "https://attacker.example")).toEqual({
      href: `/cart?checkout=processing&order=${orderId}`,
      label: "Return to cart",
    });
  });
});
