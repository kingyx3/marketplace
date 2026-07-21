import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function script(path: string): Promise<string> {
  return readFile(new URL(`../scripts/${path}`, import.meta.url), "utf8");
}

describe("Vercel provisioned secret safety", () => {
  it("preserves an unreadable one-time secret unless rotation is explicit", async () => {
    const sync = await script("sync-vercel-env.mjs");

    expect(sync).toContain('const rotateProvisioned = args.includes("--rotate-provisioned")');
    expect(sync).toContain("entry.provisioned && !rotateProvisioned");
    expect(sync).toContain(
      "Cannot rotate provisioned Vercel environment variable without a desired value"
    );
    expect(sync).toContain('fail("--rotate-provisioned cannot be combined with --check-only")');
    expect(sync).toContain('expectedStates.set(entry.key, { mode: "exists" })');
  });

  it("keeps HitPay credentials operator-managed instead of generating or rotating them", async () => {
    const reconcile = await script("reconcile-runtime-environment.mjs");
    const configure = await script("configure-hitpay.mjs");

    expect(reconcile).not.toContain("delete provisionEnvironment.HITPAY_WEBHOOK_SALT");
    expect(reconcile).not.toContain("delete process.env.HITPAY_WEBHOOK_SALT");
    expect(reconcile).not.toContain('credentials.HITPAY_WEBHOOK_SALT');
    expect(configure).toContain("HITPAY_API_KEY");
    expect(configure).not.toContain("HITPAY_WEBHOOK_SALT");
  });

  it("keeps readiness checks non-mutating for optional and sensitive values", async () => {
    const verify = await script("verify-environment.mjs");

    expect(verify).toContain('"--check-only"');
    expect(verify).toContain('"--preserve-unset-optional"');
    expect(verify).not.toContain('"--rotate-provisioned"');
  });
});
