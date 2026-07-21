import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readWorkflow = () =>
  readFile(new URL("../.github/workflows/deploy-app.yml", import.meta.url), "utf8");

describe("production deployment topology", () => {
  it("deploys main directly to production when staging is disabled", async () => {
    const workflow = await readWorkflow();
    const jobStart = workflow.indexOf("  deploy-production-direct:");

    expect(jobStart).toBeGreaterThan(-1);
    const directProductionJob = workflow.slice(jobStart);
    expect(directProductionJob).toContain("vars.ENABLE_RELEASE_TOPOLOGY != 'true'");
    expect(directProductionJob).toContain(
      "(github.event_name == 'push' && github.ref == 'refs/heads/main')"
    );
    expect(workflow).toContain(
      "Staging is not provisioned; the main revision will deploy directly to production."
    );
    expect(workflow).not.toContain("the main revision was not deployed");
  });
});
