import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { buildVercelProtectionHeaders } from "../scripts/lib/vercel-protection.mjs";

describe("Vercel deployment protection bypass", () => {
  it("adds the automation bypass header when a secret is supplied", () => {
    const headers = buildVercelProtectionHeaders({
      VERCEL_AUTOMATION_BYPASS_SECRET: "  bypass-secret  ",
    });

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-vercel-protection-bypass")).toBe("bypass-secret");
  });

  it("does not send an empty bypass header", () => {
    const headers = buildVercelProtectionHeaders({
      VERCEL_AUTOMATION_BYPASS_SECRET: "   ",
    });

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("x-vercel-protection-bypass")).toBe(false);
  });

  it("wires the GitHub Environment secret into release-readiness verification", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/bootstrap-environment.yml", import.meta.url),
      "utf8"
    );
    const verification = await readFile(
      new URL("../scripts/verify-environment.mjs", import.meta.url),
      "utf8"
    );

    expect(workflow).toContain(
      "VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}"
    );
    expect(verification).toContain("buildVercelProtectionHeaders()");
  });
});
