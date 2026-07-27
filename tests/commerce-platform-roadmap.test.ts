import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const roadmapPath = path.join(
  repositoryRoot,
  "docs/commerce-platform-roadmap.md",
);

const maturityStates = [
  "Not started",
  "Discovery",
  "Planned",
  "In progress",
  "Partially implemented",
  "Production ready",
  "Needs remediation",
  "Deferred",
];

const capabilityAreas = [
  "Product and catalogue management",
  "Inventory management",
  "Pricing and promotions",
  "Cart and checkout",
  "Payment-provider abstraction",
  "Orders and order lifecycle",
  "Shipping, fulfilment and delivery",
  "Returns, refunds and exchanges",
  "Customer accounts and engagement",
  "Merchant and admin operations",
  "Storefront and content management",
  "Search and discovery",
  "Notifications and communications",
  "Analytics and reporting",
  "Multi-channel and integration readiness",
  "Security, privacy and compliance",
  "Reliability and operations",
  "Testing and quality assurance",
];

describe("commerce platform roadmap", () => {
  it("keeps every required maturity state documented", async () => {
    const roadmap = await readFile(roadmapPath, "utf8");

    for (const state of maturityStates) {
      expect(roadmap, state).toContain(`**${state}**`);
    }
  });

  it("tracks every recurring capability area exactly once", async () => {
    const roadmap = await readFile(roadmapPath, "utf8");

    for (const capability of capabilityAreas) {
      const rowPattern = new RegExp(
        `^\\| ${escapeRegExp(capability)} \\|`,
        "gmu",
      );
      expect(roadmap.match(rowPattern) ?? [], capability).toHaveLength(1);
    }
  });

  it("records active work, iteration history, risks, and the next scope", async () => {
    const roadmap = await readFile(roadmapPath, "utf8");

    expect(roadmap).toContain("## Active pull requests and issues");
    expect(roadmap).toContain("## Current highest-priority risks");
    expect(roadmap).toContain("## Iteration history");
    expect(roadmap).toContain("## Next scheduled iteration");
    expect(roadmap).toContain("**Recommended scope:**");
  });

  it("is linked from the active repository documentation", async () => {
    const [readme, buildPlan] = await Promise.all([
      readFile(path.join(repositoryRoot, "README.md"), "utf8"),
      readFile(path.join(repositoryRoot, "docs/build-plan.md"), "utf8"),
    ]);

    expect(readme).toContain("docs/commerce-platform-roadmap.md");
    expect(buildPlan).toContain("commerce-platform-roadmap.md");
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
