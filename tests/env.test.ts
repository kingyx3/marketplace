import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs module without type declarations
import { validateEnv, renderDotenv, ENV_CONTRACT } from "../scripts/generate-env.mjs";

const validEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("env contract", () => {
  it("accepts a minimal valid environment", () => {
    const { ok, errors } = validateEnv(validEnv);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it("fails fast when a required key is missing", () => {
    const rest: Record<string, string> = { ...validEnv };
    delete rest.STRIPE_SECRET_KEY;
    const { ok, errors } = validateEnv(rest);
    expect(ok).toBe(false);
    expect(errors.join("\n")).toContain("STRIPE_SECRET_KEY");
  });

  it("rejects malformed values without leaking them", () => {
    const { ok, errors } = validateEnv({ ...validEnv, STRIPE_SECRET_KEY: "not-a-stripe-key" });
    expect(ok).toBe(false);
    const message = errors.join("\n");
    expect(message).toContain("STRIPE_SECRET_KEY");
    expect(message).not.toContain("not-a-stripe-key");
  });

  it("never writes deploy-only keys into .env", () => {
    const dotenv = renderDotenv({ ...validEnv, VERCEL_TOKEN: "vercel-secret" });
    expect(dotenv).not.toContain("VERCEL_TOKEN");
    expect(dotenv).toContain("STRIPE_SECRET_KEY=sk_test_123");
  });

  it("keeps every contract key documented in .env.example", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    for (const entry of ENV_CONTRACT as Array<{ key: string }>) {
      expect(example).toContain(`${entry.key}=`);
    }
  });
});
