import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const validEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_123",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  SUPABASE_SECRET_KEY: "sb_secret_test_123",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  APP_NAME: "Marketplace",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  TARGET_ENV: "development",
};

describe("env contract", () => {
  it("accepts a minimal valid environment", () => {
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(
      `console.log(JSON.stringify(validateEnv(${literal(validEnv)})));`
    );

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails fast when a required key is missing", () => {
    const rest: Record<string, string> = { ...validEnv };
    delete rest.STRIPE_SECRET_KEY;
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(
      `console.log(JSON.stringify(validateEnv(${literal(rest)})));`
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("STRIPE_SECRET_KEY");
  });

  it("rejects malformed values without leaking them", () => {
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(
      `console.log(JSON.stringify(validateEnv(${literal({ ...validEnv, STRIPE_SECRET_KEY: "not-a-stripe-key" })})));`
    );

    expect(result.ok).toBe(false);
    const message = result.errors.join("\n");
    expect(message).toContain("STRIPE_SECRET_KEY");
    expect(message).not.toContain("not-a-stripe-key");
  });

  it("never writes deploy-only keys into .env", () => {
    const dotenv = runGenerateEnv<string>(
      `console.log(JSON.stringify(renderDotenv(${literal({ ...validEnv, VERCEL_TOKEN: "vercel-secret" })})));`
    );

    expect(dotenv).not.toContain("VERCEL_TOKEN");
    expect(dotenv).not.toContain("TARGET_ENV");
    expect(dotenv).toContain("APP_NAME=Marketplace");
    expect(dotenv).toContain("STRIPE_SECRET_KEY=sk_test_123");
  });

  it("quotes app names with spaces in generated .env files", () => {
    const dotenv = runGenerateEnv<string>(
      `console.log(JSON.stringify(renderDotenv(${literal({ ...validEnv, APP_NAME: "TCG Marketplace" })})));`
    );

    expect(dotenv).toContain('APP_NAME="TCG Marketplace"');
  });

  it("requires a known deployment target environment", () => {
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(
      `console.log(JSON.stringify(validateEnv(${literal({ ...validEnv, TARGET_ENV: "sandbox" })})));`
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("TARGET_ENV");
  });

  it("loads local .env values without overriding exported values", async () => {
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

    try {
      const env = runGenerateEnv<Record<string, string>>(
        [
          `const env = ${literal({ NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_exported" })};`,
          `await loadLocalDotenv(env, ${literal(file)});`,
          "console.log(JSON.stringify(env));",
        ].join("\n")
      );

      expect(env.TARGET_ENV).toBe("development");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
      expect(env.STRIPE_SECRET_KEY).toBe("sk_test_exported");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves deployment values from Terraform outputs without overriding explicit env", () => {
    const env: Record<string, string> = {
      TARGET_ENV: "development",
      APP_NAME: "Custom Marketplace",
      NEXT_PUBLIC_SITE_URL: "https://dev.example.com",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_123",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      VERCEL_ORG_ID: "team_test_123",
      TF_OUTPUT_JSON: JSON.stringify({
        vercel_project_id: { value: "prj_test_123" },
        supabase_project_refs: { value: { development: "abcdefghijklmnopq" } },
        supabase_project_urls: {
          value: { development: "https://abcdefghijklmnopq.supabase.co" },
        },
        supabase_database_passwords: {
          value: { development: "database-password" },
          sensitive: true,
        },
      }),
    };

    const resolved = runResolveEnvironment<Record<string, string | string[]>>(
      [
        `const env = ${literal(env)};`,
        "const result = await resolveEnvironment(env, { environment: 'development', strict: true, requireDbPassword: true, loadDotenv: false });",
        "console.log(JSON.stringify({ ...env, missing: result.missing }));",
      ].join("\n")
    );

    expect(resolved.missing).toEqual([]);
    expect(resolved.APP_NAME).toBe("Custom Marketplace");
    expect(resolved.SUPABASE_PROJECT_REF).toBe("abcdefghijklmnopq");
    expect(resolved.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefghijklmnopq.supabase.co");
    expect(resolved.VERCEL_PROJECT_ID).toBe("prj_test_123");
    expect(resolved.SUPABASE_DB_PASSWORD).toBe("database-password");
  });

  it("keeps every contract key documented in .env.example", async () => {
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    const keys = runGenerateEnv<string[]>(
      "console.log(JSON.stringify(ENV_CONTRACT.map((entry) => entry.key)));"
    );

    for (const key of keys) {
      expect(example).toContain(`${key}=`);
    }
  });
});

function runGenerateEnv<T>(body: string): T {
  return runNodeModule<T>(
    [
      "import { ENV_CONTRACT, loadLocalDotenv, renderDotenv, validateEnv } from './scripts/generate-env.mjs';",
      body,
    ].join("\n")
  );
}

function runResolveEnvironment<T>(body: string): T {
  return runNodeModule<T>(
    [
      "import { resolveEnvironment } from './scripts/resolve-environment.mjs';",
      body,
    ].join("\n")
  );
}

function runNodeModule<T>(source: string): T {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return JSON.parse(result.stdout);
}

function literal(value: unknown): string {
  return JSON.stringify(value);
}
