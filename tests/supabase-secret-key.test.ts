import { describe, expect, it } from "vitest";

import { resolveSupabaseSecretKey } from "@/lib/supabase";

describe("Supabase server key resolution", () => {
  it("prefers the modern secret key", () => {
    expect(
      resolveSupabaseSecretKey({
        SUPABASE_SECRET_KEY: " sb_secret_current ",
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
      })
    ).toBe("sb_secret_current");
  });

  it("falls back to the legacy service-role key", () => {
    expect(
      resolveSupabaseSecretKey({
        SUPABASE_SERVICE_ROLE_KEY: " legacy-service-role ",
      })
    ).toBe("legacy-service-role");
  });

  it("returns an empty value when neither server key is configured", () => {
    expect(resolveSupabaseSecretKey({})).toBe("");
  });
});
