import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("checkout production readiness", () => {
  it("offers direct buy-now checkout without mutating the saved cart", async () => {
    const [productPage, cartActions, buyNowPage] = await Promise.all([
      read("app/(shop)/products/[slug]/page.tsx"),
      read("app/actions/cart.ts"),
      read("app/(shop)/buy-now/page.tsx"),
    ]);

    expect(productPage).toContain("formAction={buyNow}");
    expect(productPage).toContain("Buy now");
    expect(productPage).toContain("Add to cart");
    expect(cartActions).toContain("export async function buyNow");
    expect(cartActions).toContain("redirect(`/buy-now?${query.toString()}#checkout`)");
    expect(cartActions).not.toContain("writeCart(directItems)");
    expect(buyNowPage).toContain("Your saved cart is unchanged");
    expect(buyNowPage).toContain('startLabel="Buy now with HitPay"');
    expect(buyNowPage).toContain('successUrl: applicationUrl("/orders")');
    expect(buyNowPage).toContain("robots: { index: false, follow: false }");
  });

  it("keeps both checkout actions synchronized and focuses invalid fields", async () => {
    const checkoutPanel = await read("app/(shop)/cart/checkout-panel.tsx");

    expect(checkoutPanel.indexOf("primaryActionDisabled")).toBeLessThan(
      checkoutPanel.indexOf("<ShippingAddressFields")
    );
    expect(checkoutPanel.match(/disabled=\{primaryActionDisabled\}/g)).toHaveLength(2);
    expect(checkoutPanel.match(/\{actionLabel\}/g)).toHaveLength(2);
    expect(checkoutPanel).toContain('addressLoadState === "loading"');
    expect(checkoutPanel).toContain("focusFirstIncompleteShippingField(shippingAddress)");
    expect(checkoutPanel).toContain('document.getElementById(targetId)?.focus()');
  });

  it("passes the live request origin into hosted checkout creation", async () => {
    const checkoutRoute = await read("app/api/checkout/route.ts");

    expect(checkoutRoute).toContain("request.nextUrl.origin");
    expect(checkoutRoute).toContain("createCheckoutPayment(");
  });

  it("pins the resolved Supabase secret and gates development on deep readiness", async () => {
    const [deployScript, workflow, webhook] = await Promise.all([
      read("scripts/deploy-vercel.mjs"),
      read(".github/workflows/deploy.yml"),
      read("app/api/webhooks/hitpay/route.ts"),
    ]);

    expect(deployScript).toContain("SUPABASE_SECRET_KEY must be resolved before deployment");
    expect(deployScript).toContain("`SUPABASE_SECRET_KEY=${supabaseSecretKey}`");

    const readinessStep = workflow.slice(workflow.indexOf("- name: Deep readiness check"));
    expect(readinessStep).toContain("--deep");
    expect(readinessStep.split("\n").slice(0, 3).join("\n")).not.toContain("if:");

    expect(webhook).toContain("hitpay.webhook.database_not_configured");
    expect(webhook).toContain("settlement temporarily unavailable");
  });
});
