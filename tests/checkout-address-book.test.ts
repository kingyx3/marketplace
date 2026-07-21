import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { listCustomerAddresses } from "@/lib/customer-addresses";
import { normalizeHitPayExpiresAfter } from "@/lib/hitpay";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("checkout delivery address book", () => {
  it("returns unique, most-recent order destinations as reusable addresses", async () => {
    const rows = [
      {
        id: "order-new",
        shipping_address: {
          recipientName: "Buyer",
          line1: "1 Market Street",
          city: "Singapore",
          postalCode: "048940",
          countryCode: "SG",
          phone: "+65 6123 4567",
        },
        placed_at: "2026-07-21T07:00:00.000Z",
        created_at: "2026-07-21T06:59:00.000Z",
      },
      {
        id: "order-duplicate",
        shipping_address: {
          recipientName: " Buyer ",
          line1: "1 MARKET STREET",
          city: "Singapore",
          postalCode: "048940",
          countryCode: "sg",
          phone: "+65 6123 4567",
        },
        placed_at: "2026-07-20T07:00:00.000Z",
        created_at: "2026-07-20T06:59:00.000Z",
      },
      {
        id: "order-other",
        shipping_address: {
          recipientName: "Buyer",
          line1: "8 Another Road",
          postalCode: "123456",
          countryCode: "SG",
        },
        placed_at: null,
        created_at: "2026-07-19T06:59:00.000Z",
      },
    ];
    const builder = chainResult(rows);
    const supabase = { from: vi.fn(() => builder) };

    await expect(listCustomerAddresses(supabase as never, "customer-1")).resolves.toEqual([
      expect.objectContaining({
        id: "order-new",
        line1: "1 Market Street",
        postalCode: "048940",
        countryCode: "SG",
        lastUsedAt: "2026-07-21T07:00:00.000Z",
      }),
      expect.objectContaining({
        id: "order-other",
        line1: "8 Another Road",
        postalCode: "123456",
        lastUsedAt: "2026-07-19T06:59:00.000Z",
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(builder.eq).toHaveBeenCalledWith("customer_id", "customer-1");
  });

  it("uses HitPay's accepted expiry token on the provider wire", () => {
    expect(normalizeHitPayExpiresAfter("15 minutes")).toBe("15 mins");
    expect(normalizeHitPayExpiresAfter("2 hours")).toBe("2 hours");
    expect(() => normalizeHitPayExpiresAfter("tomorrow")).toThrow(
      "must use minutes, hours, or days"
    );
  });

  it("renders saved-address selection, required markers, and autofill-compatible fields", async () => {
    const [panel, fields, route] = await Promise.all([
      readSource("app/(shop)/cart/checkout-panel.tsx"),
      readSource("app/(shop)/cart/shipping-address-fields.tsx"),
      readSource("app/api/account/addresses/route.ts"),
    ]);

    expect(panel).toContain('.request<SavedAddressesResponse>("/api/account/addresses"');
    expect(panel).toContain("Previously used delivery address");
    expect(panel).toContain("Deliver to another address");
    expect(panel).toContain('autoComplete="on"');
    expect(fields).toContain("<RequiredMark />");
    expect(fields).toContain('autoComplete="shipping name"');
    expect(fields).toContain('autoComplete="shipping address-line1"');
    expect(fields).toContain('autoComplete="shipping postal-code"');
    expect(fields).toContain('autoComplete="shipping tel"');
    expect(route).toContain("requireApiCustomer(request)");
  });
});

function chainResult(rows: unknown[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  return builder;
}
