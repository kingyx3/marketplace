import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  resolveAllowlistedAdminStaff,
  type StaffProfile,
} from "@/lib/admin-staff";

describe("allowlisted admin staff resolution", () => {
  it("returns an existing active staff profile without changing it", async () => {
    const existing: StaffProfile = { id: "staff-1", role: "owner", active: true };
    const { client, insert } = createStaffClient(existing);

    await expect(resolveAllowlistedAdminStaff(client, "user-1")).resolves.toEqual(existing);
    expect(insert).not.toHaveBeenCalled();
  });

  it("provisions a missing allowlisted user as an active admin", async () => {
    const { client, insert } = createStaffClient(null);

    await expect(resolveAllowlistedAdminStaff(client, "user-2")).resolves.toEqual({
      id: "provisioned-staff",
      role: "admin",
      active: true,
    });
    expect(insert).toHaveBeenCalledWith({
      auth_user_id: "user-2",
      role: "admin",
      active: true,
    });
  });

  it("preserves explicit revocation for an inactive staff profile", async () => {
    const inactive: StaffProfile = { id: "staff-3", role: "admin", active: false };
    const { client, insert } = createStaffClient(inactive);

    await expect(resolveAllowlistedAdminStaff(client, "user-3")).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
});

function createStaffClient(initial: StaffProfile | null): {
  client: SupabaseClient;
  insert: ReturnType<typeof vi.fn>;
} {
  let row = initial;
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const insert = vi.fn((input: { auth_user_id: string; role: "admin"; active: true }) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => {
        row = { id: "provisioned-staff", role: input.role, active: input.active };
        return { data: row, error: null };
      }),
    })),
  }));

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
      insert,
    })),
  } as unknown as SupabaseClient;

  return { client, insert };
}
