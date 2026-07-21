import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("authenticated shipping checkout flow", () => {
  it("enables a safe Singapore shipping policy without overwriting an active policy", async () => {
    const migration = await readSource(
      "supabase/migrations/20260721154500_enable_default_shipping_checkout.sql"
    );

    expect(migration).toContain('"enabled":true');
    expect(migration).toContain('"currency":"SGD"');
    expect(migration).toContain('"flatRateCents":0');
    expect(migration).toContain('"serviceName":"Standard delivery"');
    expect(migration).toContain("not active");
    expect(migration).toContain("lower(coalesce(value->>'enabled', 'false')) <> 'true'");
  });

  it("shows checkout only to authenticated cart users and passes their profile name", async () => {
    const cartPage = await readSource("app/(shop)/cart/page.tsx");

    expect(cartPage).toContain("const recipientName = authenticatedDisplayName(user?.user_metadata)");
    expect(cartPage).toContain("initialRecipientName={recipientName}");
    expect(cartPage).toContain("Sign in to place your order");
    expect(cartPage).toContain('href="/sign-in?next=%2Fcart"');
  });

  it("prefills the recipient and rechecks the browser session before payment", async () => {
    const checkoutPanel = await readSource("app/(shop)/cart/checkout-panel.tsx");

    expect(checkoutPanel).toContain("recipientName: initialRecipientName.trim()");
    expect(checkoutPanel).toContain("const accessToken = await session.getAccessToken()");
    expect(checkoutPanel).toContain("if (!accessToken)");
  });
});
