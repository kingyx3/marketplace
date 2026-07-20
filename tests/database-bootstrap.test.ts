import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  DATABASE_BOOTSTRAP_TARGETS,
  SEEDED_PUBLIC_TABLES,
  compareBootstrapCoverage,
  discoverActivePublicTables,
} from "../scripts/bootstrap-database.mjs";

describe("database bootstrap", () => {
  it("is restricted to development and staging", () => {
    expect(DATABASE_BOOTSTRAP_TARGETS).toEqual(["development", "staging"]);
  });

  it("has an upsert handler for every active public application table", async () => {
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const filenames = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
    const sqlByFilename = Object.fromEntries(
      await Promise.all(
        filenames.map(async (filename) => [
          filename,
          await readFile(new URL(filename, directory), "utf8"),
        ])
      )
    );

    const activeTables = discoverActivePublicTables(sqlByFilename);
    expect(compareBootstrapCoverage(activeTables, SEEDED_PUBLIC_TABLES)).toEqual({
      missing: [],
      stale: [],
    });
  });

  it("runs through GitHub Environments and verifies the public product path", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/bootstrap-database.yml", import.meta.url),
      "utf8"
    );
    const script = await readFile(
      new URL("../scripts/bootstrap-database.mjs", import.meta.url),
      "utf8"
    );
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

    expect(workflow).toContain("options: [development, staging]");
    expect(workflow).not.toContain("options: [development, staging, production]");
    expect(workflow).toContain("environment: ${{ inputs.target }}");
    expect(workflow).toContain("resolve-terraform-inputs.mjs platform");
    expect(workflow).toContain("resolve-environment.mjs");
    expect(workflow).toContain("--verify-supabase-keys");
    expect(workflow).toContain("SUPABASE_SECRET_KEY");
    expect(pkg.scripts["db:bootstrap"]).toBe("node scripts/bootstrap-database.mjs");
    expect(script).toContain('rpc(client, "admin_upsert_category"');
    expect(script).toContain('rpc(client, "admin_upsert_set_release"');
    expect(script).toContain('rpc(client, "admin_upsert_catalog_product"');
    expect(script).toContain('rpc(client, "admin_upsert_catalog_sku"');
    expect(script).toContain('rpc(client, "admin_upsert_supplier"');
    expect(script).toContain('rpc(client, "admin_upsert_storefront_listing"');
    expect(script).toContain('rpc(client, "admin_set_listing_publication"');
    expect(script).toContain("verifyAnonymousRead");
    expect(script).toContain("verifyHostedStorefront");
  });
});
