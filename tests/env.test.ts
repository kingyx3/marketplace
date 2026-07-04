import { beforeAll, describe, it, expect } from "vitest";

let validateEnv: (env: Record<string, string>) => { ok: boolean; errors: string[] };
let renderDotenv: (env: Record<string, string>) => string;
let envContract: Array<{ key: string }>;
let loadLocalDotenv: (env: Record<string, string>, path: string) => Promise<boolean>;

const validEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  TARGET_ENV: "development",
};

describe("env contract", () => {
  beforeAll(async () => {
    const envModulePath = new URL("../scripts/generate-env.mjs", import.meta.url).href;
    const envModule = await import(/* @vite-ignore */ envModulePath);
    validateEnv = envModule.validateEnv;
    renderDotenv = envModule.renderDotenv;
    envContract = envModule.ENV_CONTRACT;
    loadLocalDotenv = envModule.loadLocalDotenv;
  });

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
    expect(dotenv).not.toContain("TARGET_ENV");
    expect(dotenv).toContain("STRIPE_SECRET_KEY=sk_test_123");
  });

  it("requires a known deployment target environment", () => {
    const { ok, errors } = validateEnv({ ...validEnv, TARGET_ENV: "sandbox" });
    expect(ok).toBe(false);
    expect(errors.join("\n")).toContain("TARGET_ENV");
  });

  it("loads local .env values without overriding exported values", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const dir = await mkdtemp(join(tmpdir(), "marketplace-env-"));
    const file = join(dir, ".env");
    await writeFile(
      file,
      [
        "TARGET_ENV=development",
        "STRIPE_SECRET_KEY=sk_test_from_file",
        "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
      ].join("\n"),
      "utf8"
    );

    const env: Record<string, string> = {
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: "sk_test_exported",
    };
    try {
      await expect(loadLocalDotenv(env, file)).resolves.toBe(true);
      expect(env.TARGET_ENV).toBe("development");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
      expect(env.STRIPE_SECRET_KEY).toBe("sk_test_exported");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps every contract key documented in .env.example", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    for (const entry of envContract) {
      expect(example).toContain(`${entry.key}=`);
    }
  });
});
