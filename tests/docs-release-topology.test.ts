import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("release topology documentation", () => {
  it("keeps operator-facing topology claims aligned with Terraform", async () => {
    const [readme, deployment, provisioning, architecture, platform] = await Promise.all([
      read("README.md"),
      read("docs/deployment.md"),
      read("docs/provisioning.md"),
      read("docs/architecture.md"),
      read("infra/terraform/platform/main.tf"),
    ]);

    for (const document of [readme, deployment, provisioning, architecture]) {
      expect(document).toContain("ENABLE_RELEASE_TOPOLOGY=true");
    }

    expect(readme).toContain("staging fails closed");
    expect(deployment).toContain("Selecting `staging` fails closed");
    expect(provisioning).toContain("The default compact topology manages");
    expect(architecture).toContain("The default compact topology has two deployable targets");

    expect(platform).toContain('base_supabase_environments    = toset(["development", "production"])');
    expect(platform).toContain("release_supabase_environments = var.enable_release_topology");
    expect(platform).toContain("count = var.enable_release_topology ? 1 : 0");
  });
});
