import { expect, test } from "./fixtures";

const CATALOG_RESULTS = { name: "Catalog results" } as const;

test.describe("catalog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Sealed products" })).toBeVisible();
  });

  test("loads preview inventory and opens a product", async ({ page }) => {
    const results = page.getByRole("region", CATALOG_RESULTS);

    await expect(page.getByText("Showing 4 of 4 products")).toBeVisible();
    await expect(results.getByRole("article")).toHaveCount(4);

    await results
      .getByRole("link", { name: /sample standard play booster box/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/catalog\/smp-play-booster-box$/);
    await expect(
      page.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toBeVisible();
    await expect(page.getByText("Price", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
  });

  test("applies query, game, and status filters", async ({ page }) => {
    const results = page.getByRole("region", CATALOG_RESULTS);
    const search = page.getByRole("searchbox", { name: "Search" });

    await search.fill("pokemon");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Showing 1 of 4 products")).toBeVisible();
    await expect(
      results.getByRole("heading", { name: "Prism Rift Collector Booster Box" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByLabel("Game").selectOption("Lorcana");
    await page.getByLabel("Status").selectOption("preorder_open");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(results.getByRole("heading", { name: "Aurora Skies Booster Box" })).toBeVisible();

    await page.getByLabel("Game").selectOption("all");
    await page.getByLabel("Status").selectOption("released");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(results.getByRole("heading", { name: "Grand Line Booster Case" })).toBeVisible();
  });

  test("keeps draft filters separate and resets every control", async ({ page }) => {
    const results = page.getByRole("region", CATALOG_RESULTS);
    const search = page.getByRole("searchbox", { name: "Search" });
    const clear = page.getByRole("button", { name: "Clear", exact: true });

    await expect(clear).toBeDisabled();
    await search.fill("draft query");
    await expect(clear).toBeEnabled();
    await expect(results.getByRole("article")).toHaveCount(4);

    await clear.click();
    await expect(search).toHaveValue("");
    await expect(page.getByLabel("Game")).toHaveValue("all");
    await expect(page.getByLabel("Status")).toHaveValue("all");
    await expect(clear).toBeDisabled();
    await expect(results.getByRole("article")).toHaveCount(4);
  });

  test("shows a recoverable empty state", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search" });

    await search.fill("not-a-real-product");
    await search.press("Enter");
    await expect(
      page.getByRole("heading", { name: "No products match these filters" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByText("Showing 4 of 4 products")).toBeVisible();
    await expect(page.getByRole("region", CATALOG_RESULTS).getByRole("article")).toHaveCount(4);
  });
});
