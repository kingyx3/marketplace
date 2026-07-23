import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const browserSessionModule = "lib/auth/browser-session.ts";

const forbiddenClientImports = [
  /from\s+["']@supabase\/supabase-js["']/,
  /from\s+["']@\/lib\/supabase["']/,
  /from\s+["']@supabase\/ssr["']/,
];

const directDatabasePatterns = [
  /\bsupabase\s*\.\s*from\s*\(/,
  /\bsupabase\s*\.\s*rpc\s*\(/,
  /\bsupabase\s*\.\s*storage\b/,
  /\bcreateBrowserClient\s*\(/,
  /\bcreateClient\s*\(/,
];

describe("API architecture boundary", () => {
  it("prevents client modules from importing database clients or issuing database operations", async () => {
    const files = await sourceFiles(["app", "lib"]);
    const violations: string[] = [];

    for (const absolutePath of files) {
      const relativePath = normalize(
        path.relative(repositoryRoot, absolutePath),
      );
      const source = await readFile(absolutePath, "utf8");
      if (!isClientModule(source)) continue;

      for (const pattern of forbiddenClientImports) {
        if (pattern.test(source) && relativePath !== browserSessionModule) {
          violations.push(`${relativePath}: restricted Supabase import`);
        }
      }

      for (const pattern of directDatabasePatterns) {
        if (pattern.test(source) && relativePath !== browserSessionModule) {
          violations.push(`${relativePath}: direct database access`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("limits browser Supabase usage to session establishment", async () => {
    const sessionSource = await readFile(
      path.join(repositoryRoot, browserSessionModule),
      "utf8",
    );
    expect(sessionSource).toContain('from "@supabase/ssr"');
    expect(sessionSource).toContain("client.auth.getSession()");
    expect(sessionSource).not.toMatch(/\.from\s*\(/);
    expect(sessionSource).not.toMatch(/\.rpc\s*\(/);
    expect(sessionSource).not.toMatch(/\.storage\b/);
  });

  it("routes interactive storefront data operations through the typed API client", async () => {
    const checkout = await readFile(
      path.join(repositoryRoot, "app/(shop)/cart/checkout-panel.tsx"),
      "utf8",
    );
    const waitlist = await readFile(
      path.join(
        repositoryRoot,
        "app/(shop)/catalog/[slug]/waitlist-signup-panel.tsx",
      ),
      "utf8",
    );

    for (const source of [checkout, waitlist]) {
      expect(source).toContain('from "@/lib/api/client"');
      expect(source).not.toContain("createBrowserClient");
      expect(source).not.toContain("@/lib/supabase");
    }
  });

  it("keeps operational commerce routes on the shared API handler", async () => {
    const routes = [
      "app/api/checkout/cancel/route.ts",
      "app/api/checkout/status/route.ts",
      "app/api/cron/commerce-worker/route.ts",
      "app/api/webhooks/hitpay/route.ts",
    ];
    for (const route of routes) {
      const source = await readFile(path.join(repositoryRoot, route), "utf8");
      expect(source, route).toContain("withApiHandler");
    }
  });

  it("keeps database client factories server-only", async () => {
    const source = await readFile(
      path.join(repositoryRoot, "lib/supabase.ts"),
      "utf8",
    );
    expect(source).toContain("assertServerOnly");
    expect(source).toContain("browser data access must use /api endpoints");
  });
});

async function sourceFiles(directories: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const directory of directories) {
    await walk(path.join(repositoryRoot, directory), files);
  }
  return files;
}

async function walk(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, files);
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
}

function isClientModule(source: string): boolean {
  const normalized = source.replace(/^\s*\/\*[\s\S]*?\*\//, "").trimStart();
  return (
    normalized.startsWith('"use client"') ||
    normalized.startsWith("'use client'")
  );
}

function normalize(value: string): string {
  return value.split(path.sep).join("/");
}
