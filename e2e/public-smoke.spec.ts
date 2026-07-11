import { expect, test } from "@playwright/test";

test.describe("public commerce", () => {
  test("renders the storefront and navigates to the catalog", async ({ page }) => {
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
    await expect(page.getByText("Showing 4 of 4 products")).toBeVisible();
  });

  test("filters the catalog by search, game, and status and can reset", async ({ page }) => {
    await page.goto("/catalog");

    const results = page.getByRole("region", { name: "Catalog results" });
    const search = page.getByRole("searchbox", { name: "Search" });
    const clear = page.getByRole("button", { name: "Clear", exact: true });
    await expect(results.getByRole("article")).toHaveCount(4);
    await expect(clear).toBeDisabled();

    await search.fill("draft query");
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(search).toHaveValue("");
    await expect(page.getByText("Showing 4 of 4 products")).toBeVisible();

    await search.fill("pokemon");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Showing 1 of 4 products")).toBeVisible();
    await expect(results.getByRole("heading", { name: "Prism Rift Collector Booster Box" })).toBeVisible();
    await expect(
      results.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toHaveCount(0);

    await clear.click();
    await page.getByLabel("Game").selectOption("Lorcana");
    await page.getByLabel("Status").selectOption("preorder_open");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Showing 1 of 4 products")).toBeVisible();
    await expect(results.getByRole("heading", { name: "Aurora Skies Booster Box" })).toBeVisible();

    await page.getByLabel("Game").selectOption("all");
    await page.getByLabel("Status").selectOption("released");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(results.getByRole("heading", { name: "Grand Line Booster Case" })).toBeVisible();

    await search.fill("not-a-real-product");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(
      page.getByRole("heading", { name: "No products match these filters" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("Showing 4 of 4 products")).toBeVisible();
    await expect(results.getByRole("article")).toHaveCount(4);
  });

  test("opens a product detail and the empty cart", async ({ page }) => {
    await page.goto("/catalog");

    await page
      .getByRole("link", { name: /sample standard play booster box/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/catalog\/smp-play-booster-box$/);
    await expect(
      page.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toBeVisible();
    await expect(page.getByText("Current price")).toBeVisible();
    await expect(page.getByText("Allocation policy")).toBeVisible();

    await page.getByRole("link", { name: "Cart" }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Review sealed product order" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("serves health and returns not found for an unknown product", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBe(true);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      service: "Marketplace",
    });

    const missingProduct = await request.get("/catalog/not-a-real-product");
    expect(missingProduct.status()).toBe(404);
  });
});
