import { describe, expect, it } from "vitest";
import { previewFixturesEnabled } from "@/lib/preview-fixtures";

describe("preview fixture gate", () => {
  it("enables fixtures in local development", () => {
    expect(previewFixturesEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("enables fixtures for explicit E2E runs outside production", () => {
    expect(
      previewFixturesEnabled({
        NODE_ENV: "production",
        MARKETPLACE_PREVIEW_FIXTURES: "true",
      })
    ).toBe(true);
  });

  it("fails closed in a Vercel production runtime even when the flag is set", () => {
    expect(
      previewFixturesEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        MARKETPLACE_PREVIEW_FIXTURES: "true",
      })
    ).toBe(false);
  });

  it("fails closed for an explicit production target", () => {
    expect(
      previewFixturesEnabled({
        NODE_ENV: "production",
        TARGET_ENV: "production",
        MARKETPLACE_PREVIEW_FIXTURES: "true",
      })
    ).toBe(false);
  });
});
