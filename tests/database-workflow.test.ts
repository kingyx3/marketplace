import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("database workflow", () => {
  it("uses one fail-fast migration and contract runner in CI and deployment", async () => {
    const [ci, deploy, runner] = await Promise.all([
      read(".github/workflows/ci.yml"),
      read(".github/workflows/deploy.yml"),
      read(".github/ci/run-database-contracts.sh"),
    ]);

    for (const workflow of [ci, deploy]) {
      expect(workflow).toContain("bash .github/ci/run-database-contracts.sh");
      expect(workflow).toContain("path: migration.log");
    }

    expect(ci).toContain("VERIFY_LOGICAL_RESTORE: 'true'");
    expect(ci).toContain("terraform: ${{ steps.filter.outputs.terraform }}");
    expect(ci).toContain("if: needs.changes.outputs.terraform == 'true'");
    expect(deploy).toContain("deployment-migration-log-${{ inputs.environment }}");
    expect(deploy).toContain("hosted-migration-log-${{ inputs.environment }}");
    expect(deploy).toContain("set -Eeuo pipefail");
    expect(deploy).toContain("hosted-migration.log");
    expect(runner).toContain("set -Eeuo pipefail");
    expect(runner).toContain("ON_ERROR_STOP=1");
    expect(runner).toContain('2>&1 | tee -a "$LOG_FILE"');
  });

  it("does not recreate policies for wholesale tables removed earlier in migration order", async () => {
    const [wholesaleRemoval, accountDeletion] = await Promise.all([
      read("supabase/migrations/20260716213000_remove_wholesale_b2b.sql"),
      read("supabase/migrations/20260717014500_customer_account_soft_deletion.sql"),
    ]);

    expect(wholesaleRemoval).toContain("b2b_accounts");
    expect(accountDeletion).not.toContain("b2b_accounts");
  });

  it("verifies restores against seeded retail invariants", async () => {
    const restore = await read(".github/ci/verify-logical-restore.sh");

    expect(restore).toContain("restored database contains retired wholesale capabilities");
    expect(restore).toContain("restored database is missing seeded catalog data");
    expect(restore).toContain("restored database is missing seeded inventory state");
    expect(restore).toContain("restored database is missing seeded retail deal");
    expect(restore).toContain("restored database contains retired invoice policy");
    expect(restore).not.toContain("restored database is missing active shipping policy");
    expect(restore).not.toContain("restored database is missing invoice checkout function");
  });
});
