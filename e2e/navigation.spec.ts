import { expect, test } from "./fixtures";

test.describe("storefront navigation", () => {
  test("renders the homepage and follows primary navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /sealed booster boxes with prices and availability up front/i,
      })
    ).toBeVisible();

    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await expect(navigation.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/catalog"
    );
    await expect(navigation.getByRole("link", { name: "Deals" })).toHaveAttribute("href", "/deals");
    await expect(navigation.getByRole("link", { name: "Wholesale" })).toHaveAttribute(
      "href",
      "/wholesale"
    );
    await expect(navigation.getByRole("link", { name: "Cart" })).toHaveAttribute("href", "/cart");
    await expect(navigation.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
    await expect(navigation.getByRole("link", { name: "Preorders" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Orders" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.getByRole("link", { name: "Browse regular prices" }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { name: "Sealed product inventory" })).toBeVisible();
  });

  test("opens the empty cart from a product page", async ({ page }) => {
    await page.goto("/catalog/smp-play-booster-box", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Sample Standard Play Booster Box" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Cart", exact: true }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Review sealed product order" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  });

  test("redirects protected pages through the sign-in flow without server errors", async ({ page }) => {
    for (const path of ["/account", "/orders", "/preorders", "/admin"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} initial response`).toBeLessThan(500);
      await expect(page).toHaveURL(/\/(sign-in|auth\/auth-code-error)/);
    }
  });

  test("returns a real 404 for an unknown product", async ({ request }) => {
    const response = await request.get("/catalog/not-a-real-product");

    expect(response.status()).toBe(404);
  });
});
