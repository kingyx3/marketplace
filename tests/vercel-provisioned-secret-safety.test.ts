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
    expect(sync).toContain("Cannot rotate provisioned Vercel environment variable without a desired value");
    expect(sync).toContain('fail("--rotate-provisioned cannot be combined with --check-only")');
    expect(sync).toContain('expectedStates.set(entry.key, { mode: "exists" })');
  });

  it("verifies freshly written readable values by presence while keeping deployment fingerprints value-based", async () => {
    const sync = await script("sync-vercel-env.mjs");

    expect(sync).toContain("const verificationStates = new Map()");
    expect(sync).toMatch(
      /expectedStates\.set\(entry\.key, \{ mode: "value", fingerprint: desiredFingerprint \}\);\s*if \(currentFingerprint === desiredFingerprint\) \{\s*verificationStates\.set\(entry\.key, \{ mode: "value", fingerprint: desiredFingerprint \}\);/s
    );
    expect(sync).toMatch(/if \(currentExists\) \{\s*verificationStates\.set\(entry\.key, \{ mode: "exists" \}\);\s*updated \+= 1;/s);
    expect(sync).toMatch(/else \{\s*verificationStates\.set\(entry\.key, \{ mode: "exists" \}\);\s*added \+= 1;/s);
    expect(sync).toContain("await verifyPersistedState(context, vercelEnv, runtimeEntries, fingerprintKey, verificationStates)");
    expect(sync).toContain("deploymentFingerprintEntries(expectedStates)");
  });

  it("removes stale workflow webhook secrets and rotates only newly issued credentials", async () => {
    const reconcile = await script("reconcile-runtime-environment.mjs");

    expect(reconcile).toContain("delete provisionEnvironment.STRIPE_WEBHOOK_SECRET");
    expect(reconcile).toContain("delete process.env.STRIPE_WEBHOOK_SECRET");
    expect(reconcile).toContain('if (credentials.STRIPE_WEBHOOK_SECRET) syncArgs.push("--rotate-provisioned")');
  });

  it("keeps readiness checks non-mutating for optional and provisioned sensitive values", async () => {
    const verify = await script("verify-environment.mjs");

    expect(verify).toContain("delete verificationEnvironment.STRIPE_WEBHOOK_SECRET");
    expect(verify).toContain('"--check-only"');
    expect(verify).toContain('"--preserve-unset-optional"');
    expect(verify).not.toContain('"--rotate-provisioned"');
  });
});
