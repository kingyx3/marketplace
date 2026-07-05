import { expect, test } from "@playwright/test";

test.describe("public commerce smoke", () => {
  test("serves the storefront, catalog, product detail, cart, and shallow health", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /sealed booster boxes with allocation people can see/i,
      })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse catalog" }).first()).toBeVisible();

    await page.getByRole("link", { name: "Browse catalog" }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { name: "Sealed product inventory" })).toBeVisible();
    await expect(page.getByText("preview data", { exact: true })).toBeVisible();

    await page
      .getByRole("link", { name: /sample standard play booster box/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/catalog\/smp-play-booster-box$/);
    await expect(
      page.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toBeVisible();
    await expect(page.getByText("Current price")).toBeVisible();

    await page.getByRole("link", { name: "Cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Review sealed product order" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();

    const health = await request.get("/api/health");
    expect(health.ok()).toBe(true);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      service: "Marketplace",
    });
  });
});
