import { describe, expect, it } from "vitest";

import {
  AUDIT_PAGE_SIZE,
  auditActionLabel,
  auditAreaTables,
  auditChanges,
  auditTableLabel,
  auditTargetName,
  normalizeAuditSearch,
  parseAuditArea,
  resolveAuditActor,
} from "@/lib/control-audit";

describe("control audit history", () => {
  it("uses bounded, validated list controls", () => {
    expect(AUDIT_PAGE_SIZE).toBe(50);
    expect(parseAuditArea("commerce")).toBe("commerce");
    expect(parseAuditArea("unknown")).toBe("all");
    expect(auditAreaTables("commerce")).toContain("payments");
    expect(auditAreaTables("all")).toBeNull();
    expect(normalizeAuditSearch("  order_123,(*)  ")).toBe("order 123");
    expect(normalizeAuditSearch("x".repeat(150))).toHaveLength(100);
  });

  it("presents recognizable labels before system identifiers", () => {
    const record = {
      tableName: "products",
      oldData: null,
      newData: { referenceCode: "PKM-151-BOX", product_id: "product-id" },
    };

    expect(auditTargetName(record)).toBe("PKM-151-BOX");
    expect(auditTableLabel(record.tableName)).toBe("Product");
    expect(auditActionLabel("ADMIN_INVENTORY_ADJUSTMENT")).toBe("Inventory adjusted");
  });

  it("shows exact safe before-and-after values without exposing arbitrary fields", () => {
    const changes = auditChanges({
      tableName: "product_inventory",
      oldData: { on_hand: 12, incoming: 4, secret_token: "before" },
      newData: { on_hand: 9, incoming: 4, allocated: 3, secret_token: "after" },
    });

    expect(changes).toContainEqual({ label: "On hand", value: "12 → 9" });
    expect(changes).toContainEqual({ label: "Allocated", value: "3" });
    expect(changes).not.toContainEqual(expect.objectContaining({ label: "secret_token" }));
    expect(JSON.stringify(changes)).not.toContain("before");
    expect(JSON.stringify(changes)).not.toContain("after");
  });

  it("resolves administrator emails while retaining the exact actor reference", () => {
    const staff = new Map([["auth-user-id", "operator@example.test"]]);

    expect(resolveAuditActor("staff:auth-user-id", staff)).toEqual({
      label: "operator@example.test",
      reference: "staff:auth-user-id",
    });
    expect(resolveAuditActor("service", staff)).toEqual({
      label: "Marketplace service",
      reference: null,
    });
  });
});
