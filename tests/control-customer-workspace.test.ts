import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  customerAccountLabel,
  customerAccountSystemStatus,
  customerProvisioningLabel,
  customerProvisioningNeedsAttention,
  isCustomerIdentifier,
  parseCustomerIdentity,
  parseCustomerProvisioning,
  parseCustomerSort,
  parseCustomerStatus,
} from "@/lib/control-customer-view";

describe("control customer workspace", () => {
  it("normalizes supported operator filters and rejects stale values", () => {
    expect(parseCustomerStatus("disabled")).toBe("disabled");
    expect(parseCustomerStatus("deleted")).toBe("all");
    expect(parseCustomerIdentity("unlinked")).toBe("unlinked");
    expect(parseCustomerIdentity("unknown")).toBe("all");
    expect(parseCustomerProvisioning("attention")).toBe("attention");
    expect(parseCustomerProvisioning("complete")).toBe("all");
    expect(parseCustomerSort("name")).toBe("name");
    expect(parseCustomerSort("newest")).toBe("updated_desc");
  });

  it("only treats canonical UUIDs as exact customer identifiers", () => {
    expect(isCustomerIdentifier("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isCustomerIdentifier("11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(isCustomerIdentifier("customer@example.test")).toBe(false);
  });

  it("keeps human and system account states precise", () => {
    expect(customerAccountLabel(null)).toBe("Active");
    expect(customerAccountSystemStatus(null)).toBe("active");
    expect(customerAccountLabel("2026-07-22T00:00:00.000Z")).toBe("Access disabled");
    expect(customerAccountSystemStatus("2026-07-22T00:00:00.000Z")).toBe("disabled");
    expect(customerProvisioningLabel("active")).toBe("Provisioned");
    expect(customerProvisioningLabel("pending")).toBe("Provisioning pending");
    expect(customerProvisioningNeedsAttention("error")).toBe(true);
    expect(customerProvisioningNeedsAttention("active")).toBe(false);
  });

  it("ships exact identifier lookup, active filters, and bounded pagination", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/customers/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("id.eq.${query},auth_user_id.eq.${query}");
    expect(source).toContain('aria-label="Active customer filters"');
    expect(source).toContain('name="identity"');
    expect(source).toContain('name="provisioning"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("Customer ID");
    expect(source).toContain("Auth user ID");
    expect(source).toContain("System:");
    expect(source).toContain("const PAGE_SIZE = 50");
    expect(source).toContain(".range(offset, offset + PAGE_SIZE - 1)");
  });

  it("keeps lifecycle mutations permission-gated on the detail page", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/customers/[customerId]/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('hasControlPermission(staff, "customers.manage")');
    expect(source).toContain("<CustomerLifecycleControl");
    expect(source).toContain('label="System status"');
    expect(source).toContain('label="Auth user ID"');
    expect(source).toContain('label="Access disabled"');
    expect(source).not.toContain('label="Deleted"');
  });
});
