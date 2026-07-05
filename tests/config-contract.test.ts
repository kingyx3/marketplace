import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("platform config contract", () => {
  it("defines production-safe Vercel headers and API no-store caching", async () => {
    const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
    const headers = flattenHeaders(vercel.headers);
    const apiHeaders = headersForSource(vercel.headers, "/api/(.*)");

    expect(vercel.framework).toBe("nextjs");
    expect(vercel.installCommand).toBe("npm ci");
    expect(vercel.buildCommand).toBe("npm run build");
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
      "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    });
    expect(apiHeaders["Cache-Control"]).toBe("no-store, max-age=0");
  });

  it("keeps product image storage bucket and policies in migrations", async () => {
    const migrations = await allMigrationSql();

    expect(migrations).toContain("insert into storage.buckets");
    expect(migrations).toContain("'product-images'");
    expect(migrations).toContain("grant select on table storage.objects to anon, authenticated, service_role");
    expect(migrations).toContain("grant insert, update, delete on table storage.objects to authenticated, service_role");
    expect(migrations).toContain("product images are publicly readable");
    expect(migrations).toContain("staff can upload product images");
    expect(migrations).toContain("staff can update product images");
    expect(migrations).toContain("staff can delete product images");
    expect(migrations).toContain("public.current_user_is_staff");
    expect(migrations).toContain("admin_review_b2b_account");
    expect(migrations).toContain("b2b_accounts_review_status_check");
  });

  it("runs config verifier scripts in CI", async () => {
    const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts["config:check"]).toContain("verify-vercel-config.mjs");
    expect(packageJson.scripts["config:check"]).toContain("verify-supabase-config.mjs");
    expect(ci).toContain("npm run config:check");
    expect(ci).toContain("tests/config-contract.test.ts");
  });
});

function flattenHeaders(entries: Array<{ headers?: Array<{ key: string; value: string }> }>) {
  return Object.fromEntries(
    entries.flatMap((entry) => (entry.headers ?? []).map((header) => [header.key, header.value]))
  );
}

function headersForSource(
  entries: Array<{ source: string; headers?: Array<{ key: string; value: string }> }>,
  source: string
) {
  const entry = entries.find((candidate) => candidate.source === source);
  return Object.fromEntries((entry?.headers ?? []).map((header) => [header.key, header.value]));
}

async function allMigrationSql() {
  const dir = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const contents = await Promise.all(files.map((file) => readFile(join(dir, file), "utf8")));
  return contents.join("\n");
}
