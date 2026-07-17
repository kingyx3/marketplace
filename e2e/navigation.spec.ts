import { expect, test } from "./fixtures";

test.describe("storefront navigation", () => {
  test("renders the homepage and follows primary navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /sealed products, clear prices, no guesswork/i,
      })
    ).toBeVisible();

    const banner = page.getByRole("banner");
    const homeLink = banner.locator('a[href="/"]').first();
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");

    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "/products"
    );
    await expect(navigation.getByRole("link", { name: "Deals" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Wholesale" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Cart" })).toHaveAttribute("href", "/cart");
    await expect(navigation.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
    await expect(navigation.getByRole("link", { name: "Preorders" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Orders" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Control" })).toHaveCount(0);

    await page.getByRole("link", { name: "Browse products" }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { name: "Sealed products" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Deals" })).toHaveAttribute(
      "href",
      "/products?view=deals"
    );
  });

  test("keeps mobile navigation compact and the app name as the home control", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const banner = page.getByRole("banner");
    const homeLink = banner.locator('a[href="/"]').first();
    await expect(homeLink).toBeVisible();

    const mobileNavigation = page.getByRole("navigation", { name: "Mobile primary navigation" });
    await expect(mobileNavigation.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { name: "Home" })).toHaveCount(0);
    await expect(banner.getByRole("link", { name: "Cart", exact: true }).first()).toBeVisible();

    await page.goto("/products");
    await banner.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("opens the empty cart from a product page", async ({ page }) => {
    await page.goto("/products/smp-play-booster-box", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Cart", exact: true }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("returns 404 for the removed wholesale route", async ({ request }) => {
    const response = await request.get("/wholesale");
    expect(response.status()).toBe(404);
  });

  test("redirects protected pages through sign-in without server errors", async ({ page }) => {
    for (const path of ["/account", "/orders", "/preorders", "/control"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} initial response`).toBeLessThan(500);
      await expect(page).toHaveURL(/\/(sign-in|auth\/auth-code-error)/);
    }
  });

  test("returns a real 404 for an unknown product", async ({ request }) => {
    const response = await request.get("/products/not-a-real-product");
    expect(response.status()).toBe(404);
  });
});
