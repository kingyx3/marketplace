import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  normalizeAdminEmail,
  resolveAdminStaff,
  resolveAllowlistedAdminStaff,
  type StaffProfile,
} from "@/lib/admin-staff";

describe("control staff resolution", () => {
  it("normalizes administrator emails", () => {
    expect(normalizeAdminEmail(" Owner@Example.test ")).toBe("owner@example.test");
    expect(normalizeAdminEmail("  ")).toBeNull();
    expect(normalizeAdminEmail(null)).toBeNull();
  });

  it("synchronizes an environment allowlisted user as a protected owner", async () => {
    const existing: StaffProfile = {
      id: "staff-1",
      role: "admin",
      active: false,
      email: "OWNER@EXAMPLE.TEST",
      source: "database",
    };
    const state = createStaffClient({ staff: existing });

    await expect(
      resolveAllowlistedAdminStaff(state.client, "user-1", " Owner@Example.test ")
    ).resolves.toMatchObject({
      id: "staff-1",
      role: "owner",
      active: true,
      email: "owner@example.test",
      source: "environment",
    });
  });

  it("provisions a missing environment allowlisted user as an owner", async () => {
    const state = createStaffClient();

    await expect(
      resolveAllowlistedAdminStaff(state.client, "user-2", "owner@example.test")
    ).resolves.toMatchObject({
      role: "owner",
      active: true,
      email: "owner@example.test",
      source: "environment",
    });

    expect(state.staff?.auth_user_id).toBe("user-2");
  });

  it("provisions database-managed staff from an active email grant", async () => {
    const state = createStaffClient({
      grant: {
        id: "grant-1",
        role: "catalog",
        active: true,
        created_by_staff_id: "owner-staff",
      },
    });

    await expect(
      resolveAdminStaff(state.client, {
        authUserId: "user-3",
        email: "Catalog@Example.test",
        environmentAllowlisted: false,
      })
    ).resolves.toMatchObject({
      role: "catalog",
      active: true,
      email: "catalog@example.test",
      source: "database",
      created_by_staff_id: "owner-staff",
    });

    expect(state.grantAcceptedFor).toBe("user-3");
  });

  it("denies users without an environment allowlist entry or active grant", async () => {
    const state = createStaffClient();

    await expect(
      resolveAdminStaff(state.client, {
        authUserId: "user-4",
        email: "unknown@example.test",
        environmentAllowlisted: false,
      })
    ).resolves.toBeNull();
  });
});

interface FakeGrant {
  id: string;
  role: StaffProfile["role"];
  active: boolean;
  created_by_staff_id: string | null;
}

function createStaffClient(initial?: { staff?: StaffProfile; grant?: FakeGrant }) {
  const state: {
    staff: (StaffProfile & { auth_user_id?: string }) | null;
    grant: FakeGrant | null;
    grantAcceptedFor: string | null;
    client: SupabaseClient;
  } = {
    staff: initial?.staff ?? null,
    grant: initial?.grant ?? null,
    grantAcceptedFor: null,
    client: null as unknown as SupabaseClient,
  };

  state.client = {
    from(table: string) {
      if (table === "staff_users") return staffTable(state);
      if (table === "admin_access_grants") return grantTable(state);
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return state;
}

function staffTable(state: ReturnType<typeof createStaffClient>) {
  return {
    select() {
      return {
        eq(_column: string, value: string) {
          return {
            async maybeSingle() {
              const matches = state.staff?.auth_user_id
                ? state.staff.auth_user_id === value
                : Boolean(state.staff);
              return { data: matches ? state.staff : null, error: null };
            },
          };
        },
      };
    },
    update(input: Record<string, unknown>) {
      return {
        eq() {
          return {
            select() {
              return {
                async single() {
                  state.staff = { ...(state.staff ?? { id: "staff-1" }), ...input } as StaffProfile;
                  return { data: state.staff, error: null };
                },
              };
            },
          };
        },
      };
    },
    insert(input: Record<string, unknown>) {
      return {
        select() {
          return {
            async single() {
              state.staff = { id: "provisioned-staff", ...input } as StaffProfile & {
                auth_user_id?: string;
              };
              return { data: state.staff, error: null };
            },
          };
        },
      };
    },
  };
}

function grantTable(state: ReturnType<typeof createStaffClient>) {
  return {
    select() {
      return {
        eq() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: state.grant, error: null };
                },
              };
            },
          };
        },
      };
    },
    update(input: Record<string, unknown>) {
      return {
        async eq() {
          state.grantAcceptedFor = String(input.auth_user_id ?? "");
          return { error: null };
        },
      };
    },
  };
}
