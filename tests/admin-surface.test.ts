import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("admin surface", () => {
  it("uses live admin queues instead of fixture work queues", async () => {
    const source = await readFile(
      new URL("../app/(shop)/admin/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain("@/app/_data/marketplace-fixtures");
    expect(source).toContain("listAdminOrderExceptions");
    expect(source).toContain("fetchPendingB2bApplications");
    expect(source).toContain("fetchPurchaseOrders");
    expect(source).toContain("approveWholesale");
  });
});
