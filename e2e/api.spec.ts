import { expect, test } from "./fixtures";

test.describe("public API", () => {
  test("reports shallow health without provider secrets", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "Marketplace",
    });
  });

  test("rejects unsupported methods on health", async ({ request }) => {
    const response = await request.post("/api/health");

    expect(response.status()).toBe(405);
  });
});
