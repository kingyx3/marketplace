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
  GOOGLE_AUTH_ENABLED: "false",
};

describe("environment contract", () => {
  it("accepts a minimal valid runtime/deploy environment", () => {
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(`console.log(JSON.stringify(validateEnv(${literal(validEnv)})));`);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("requires OAuth credentials only when the capability is enabled", () => {
    const result = runGenerateEnv<{ ok: boolean; errors: string[] }>(
      `console.log(JSON.stringify(validateEnv(${literal({ ...validEnv, GOOGLE_AUTH_ENABLED: "true" })})));`
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(result.errors.join("\n")).toContain("GOOGLE_OAUTH_CLIENT_SECRET");
  });

  it("allows the generated Stripe signing secret to be absent only during pre-provision checks", () => {
    const withoutWebhook = { ...validEnv };
    delete withoutWebhook.STRIPE_WEBHOOK_SECRET;
    const strict = runGenerateEnv<{ ok: boolean }>(`console.log(JSON.stringify(validateEnv(${literal(withoutWebhook)})));`);
    const preProvision = runGenerateEnv<{ ok: boolean }>(
      `console.log(JSON.stringify(validateEnv(${literal(withoutWebhook)}, { allowMissingProvisioned: true })));`
    );
    expect(strict.ok).toBe(false);
    expect(preProvision.ok).toBe(true);
  });

  it("never writes deploy-only keys into runtime dotenv", () => {
    const dotenv = runGenerateEnv<string>(`console.log(JSON.stringify(renderDotenv(${literal(validEnv)})));`);
    expect(dotenv).not.toContain("TARGET_ENV");
    expect(dotenv).not.toContain("GOOGLE_AUTH_ENABLED");
    expect(dotenv).toContain("APP_NAME=Marketplace");
  });

  it("loads local dotenv without overriding exported values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "marketplace-env-"));
    const file = join(dir, ".env");
    await writeFile(file, "TARGET_ENV=development\nSTRIPE_SECRET_KEY=sk_test_from_file\n", "utf8");
    try {
      const env = runGenerateEnv<Record<string, string>>([
        `const env = ${literal({ STRIPE_SECRET_KEY: "sk_test_exported" })};`,
        `await loadLocalDotenv(env, ${literal(file)});`,
        "console.log(JSON.stringify(env));",
      ].join("\n"));
      expect(env.TARGET_ENV).toBe("development");
      expect(env.STRIPE_SECRET_KEY).toBe("sk_test_exported");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves Terraform outputs without overriding explicit environment values", () => {
    const env = {
      TARGET_ENV: "development",
      GOOGLE_AUTH_ENABLED: "false",
      APP_NAME: "Custom Marketplace",
      NEXT_PUBLIC_SITE_URL: "https://dev.example.com",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_123",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      SUPABASE_SECRET_KEY: "sb_secret_test_123",
      VERCEL_ORG_ID: "team_test_123",
      TF_OUTPUT_JSON: JSON.stringify({
        vercel_project_id: { value: "prj_test_123" },
        supabase_project_refs: { value: { development: "abcdefghijklmnopq" } },
        supabase_project_urls: { value: { development: "https://abcdefghijklmnopq.supabase.co" } },
        supabase_database_passwords: { value: { development: "database-password" }, sensitive: true },
      }),
    };
    const resolved = runResolveEnvironment<Record<string, string | string[]>>([
      `const env = ${literal(env)};`,
      "const result = await resolveEnvironment(env, { environment: 'development', strict: true, requireDbPassword: true, loadDotenv: false });",
      "console.log(JSON.stringify({ ...env, missing: result.missing }));",
    ].join("\n"));
    expect(resolved.missing).toEqual([]);
    expect(resolved.APP_NAME).toBe("Custom Marketplace");
    expect(resolved.SUPABASE_PROJECT_REF).toBe("abcdefghijklmnopq");
    expect(resolved.SUPABASE_DB_PASSWORD).toBe("database-password");
  });

  it("reconciles Supabase keys against the Terraform-selected project for every target", () => {
    const resolved = runResolveEnvironment<{
      environments: Record<string, Record<string, string>>;
      requests: string[];
    }>(`
      const refs = {
        development: 'aaaaaaaaaaaaaaa',
        staging: 'bbbbbbbbbbbbbbb',
        production: 'ccccccccccccccc',
      };
      const requests = [];
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        requests.push(url.toString());
        const segments = url.pathname.split('/');
        const ref = segments[segments.indexOf('projects') + 1];
        return {
          ok: true,
          json: async () => [
            { type: 'publishable', api_key: \`sb_publishable_\${ref}\` },
            { type: 'secret', name: 'default', api_key: \`sb_secret_\${ref}_default\` },
            { type: 'secret', name: 'secondary', api_key: \`sb_secret_\${ref}_secondary\` },
            { type: 'secret', name: 'disabled', api_key: \`sb_secret_\${ref}_disabled\`, disabled: true },
          ],
        };
      };

      const environments = {};
      for (const target of Object.keys(refs)) {
        const env = {
          TARGET_ENV: target,
          GOOGLE_AUTH_ENABLED: 'false',
          SUPABASE_ACCESS_TOKEN: 'sbp_test_access_token',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_wrong_project',
          SUPABASE_SECRET_KEY:
            target === 'staging' ? \`sb_secret_\${refs[target]}_secondary\` : 'sb_secret_wrong_project',
          TF_OUTPUT_JSON: JSON.stringify({
            supabase_project_refs: { value: refs },
            supabase_project_urls: {
              value: Object.fromEntries(
                Object.entries(refs).map(([name, ref]) => [name, \`https://\${ref}.supabase.co\`])
              ),
            },
          }),
        };
        await resolveEnvironment(env, { environment: target, loadDotenv: false });
        environments[target] = {
          projectRef: env.SUPABASE_PROJECT_REF,
          url: env.NEXT_PUBLIC_SUPABASE_URL,
          publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          secretKey: env.SUPABASE_SECRET_KEY,
        };
      }
      console.log(JSON.stringify({ environments, requests }));
    `);

    for (const [target, ref] of Object.entries({
      development: "aaaaaaaaaaaaaaa",
      staging: "bbbbbbbbbbbbbbb",
      production: "ccccccccccccccc",
    })) {
      expect(resolved.environments[target]).toEqual({
        projectRef: ref,
        url: `https://${ref}.supabase.co`,
        publishableKey: `sb_publishable_${ref}`,
        secretKey:
          target === "staging"
            ? `sb_secret_${ref}_secondary`
            : `sb_secret_${ref}_default`,
      });
    }
    expect(resolved.requests).toHaveLength(3);
    expect(resolved.requests.every((url) => url.endsWith("/api-keys?reveal=true"))).toBe(true);
  });

  it("reconciles stale Supabase keys from the selected project, including legacy service_role keys", () => {
    const env = {
      TARGET_ENV: "development",
      GOOGLE_AUTH_ENABLED: "false",
      APP_NAME: "Marketplace",
      NEXT_PUBLIC_SITE_URL: "https://dev.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopq.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "stale-publishable-key",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      SUPABASE_SECRET_KEY: "stale-secret-key",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopq",
      SUPABASE_ACCESS_TOKEN: "sbp_test_token",
      VERCEL_ORG_ID: "team_test_123",
      VERCEL_PROJECT_ID: "prj_test_123",
    };
    const resolved = runResolveEnvironment<Record<string, string>>([
      "globalThis.fetch = async (input) => {",
      "  if (!String(input).includes('/api-keys')) throw new Error(`unexpected fetch: ${input}`);",
      "  return new Response(JSON.stringify([",
      "    { name: 'anon', api_key: 'legacy-anon-key' },",
      "    { name: 'service_role', api_key: 'legacy-service-role-key' },",
      "  ]), { status: 200, headers: { 'content-type': 'application/json' } });",
      "};",
      `const env = ${literal(env)};`,
      "await resolveEnvironment(env, { environment: 'development', strict: true, loadDotenv: false });",
      "console.log(JSON.stringify(env));",
    ].join("\n"));
    expect(resolved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("legacy-anon-key");
    expect(resolved.SUPABASE_SECRET_KEY).toBe("legacy-service-role-key");
  });

  it("rejects a Supabase key that does not authenticate against the selected project", () => {
    const env = {
      TARGET_ENV: "development",
      GOOGLE_AUTH_ENABLED: "false",
      APP_NAME: "Marketplace",
      NEXT_PUBLIC_SITE_URL: "https://dev.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopq.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "valid-publishable-key",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      SUPABASE_SECRET_KEY: "wrong-project-secret-key",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopq",
      VERCEL_ORG_ID: "team_test_123",
      VERCEL_PROJECT_ID: "prj_test_123",
    };
    const result = runResolveEnvironment<{ ok: boolean; message: string }>([
      "globalThis.fetch = async (_input, init) => {",
      "  const key = init?.headers?.apikey;",
      "  return key === 'valid-publishable-key'",
      "    ? new Response('[]', { status: 200 })",
      "    : new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 });",
      "};",
      `const env = ${literal(env)};`,
      "try {",
      "  await resolveEnvironment(env, { environment: 'development', strict: true, verifySupabaseKeys: true, loadDotenv: false });",
      "  console.log(JSON.stringify({ ok: true, message: '' }));",
      "} catch (error) {",
      "  console.log(JSON.stringify({ ok: false, message: error.message }));",
      "}",
    ].join("\n"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("SUPABASE_SECRET_KEY is not valid for Supabase project abcdefghijklmnopq");
    expect(result.message).toContain("Re-run Bootstrap & Deploy");
  });

  it("keeps generated artifacts in sync with every contract key", async () => {
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    const keys = runGenerateEnv<string[]>("console.log(JSON.stringify(ENV_CONTRACT.map((entry) => entry.key)));");
    for (const key of keys) expect(example).toContain(`${key}=`);
    const result = spawnSync(process.execPath, ["scripts/generate-environment-artifacts.mjs", "--check"], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});

function runGenerateEnv<T>(body: string): T {
  return runNodeModule<T>(`import { ENV_CONTRACT, loadLocalDotenv, renderDotenv, validateEnv } from './scripts/generate-env.mjs';\n${body}`);
}
function runResolveEnvironment<T>(body: string): T {
  return runNodeModule<T>(`import { resolveEnvironment } from './scripts/resolve-environment.mjs';\n${body}`);
}
function runNodeModule<T>(source: string): T {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function literal(value: unknown): string { return JSON.stringify(value); }
