import { describe, expect, it } from "vitest";

import { getAppName } from "@/lib/app-config";

describe("application name", () => {
  it("uses the configured APP_NAME after trimming it", () => {
    expect(getAppName({ APP_NAME: "  Card Vault  " })).toBe("Card Vault");
  });

  it("uses a neutral local fallback rather than a hardcoded product brand", () => {
    expect(getAppName({})).toBe("Store");
  });
});
