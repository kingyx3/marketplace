import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  administratorIdentityLabel,
  administratorRoleLabel,
  administratorSystemStatus,
  isAdministratorIdentifier,
  parseAdministratorIdentity,
  parseAdministratorRole,
  parseAdministratorSort,
  parseAdministratorStatus,
} from "@/lib/control-governance-view";

describe("control administrator workspace", () => {
  it("normalizes supported access-review filters and rejects stale values", () => {
    expect(parseAdministratorStatus("revoked")).toBe("revoked");
    expect(parseAdministratorStatus("disabled")).toBe("all");
    expect(parseAdministratorIdentity("pending")).toBe("pending");
    expect(parseAdministratorIdentity("unlinked")).toBe("all");
    expect(parseAdministratorRole("operations")).toBe("operations");
    expect(parseAdministratorRole("superuser")).toBe("all");
    expect(parseAdministratorSort("email")).toBe("email");
    expect(parseAdministratorSort("newest")).toBe("action");
  });

  it("only treats canonical UUIDs as exact administrator identifiers", () => {
    expect(isAdministratorIdentifier("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isAdministratorIdentifier("11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(isAdministratorIdentifier("owner@example.test")).toBe(false);
  });

  it("keeps human and underlying access states precise", () => {
    expect(administratorRoleLabel("operations")).toBe("Operations");
    expect(administratorIdentityLabel(null)).toBe("Pending first sign-in");
    expect(administratorIdentityLabel("user-id")).toBe("Identity accepted");
    expect(administratorSystemStatus(true)).toBe("active");
    expect(administratorSystemStatus(false)).toBe("revoked");
  });

  it("ships exact identifier lookup, action queues, active filters, and pagination", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/governance/administrators/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("id.eq.${query},auth_user_id.eq.${query}");
    expect(source).toContain('aria-label="Active administrator filters"');
    expect(source).toContain('name="identity"');
    expect(source).toContain('name="role"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("Grant ID");
    expect(source).toContain("Auth user ID");
    expect(source).toContain("System:");
    expect(source).toContain("const PAGE_SIZE = 24");
    expect(source).toContain(".range(offset, offset + PAGE_SIZE - 1)");
  });

  it("keeps access mutations permission-gated on the detail page", async () => {
    const source = await readFile(
      new URL(
        "../app/(shop)/control/governance/administrators/[grantId]/page.tsx",
        import.meta.url
      ),
      "utf8"
    );

    expect(source).toContain('hasControlPermission(staff, "governance.manage")');
    expect(source).toContain("<AdministratorGrantForm");
    expect(source).toContain('label="Grant ID"');
    expect(source).toContain('label="Auth user ID"');
    expect(source).toContain('label="System access state"');
  });
});
