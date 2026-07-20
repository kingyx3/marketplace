import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireControlPermission: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/control-access", () => ({
  requireControlPermission: mocks.requireControlPermission,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  initialCustomerLifecycleActionState,
  setCustomerAccountDeleted,
} from "@/app/actions/customer-admin";

describe("customer lifecycle action", () => {
  beforeEach(() => {
    mocks.requireControlPermission.mockReset();
    mocks.createServiceClient.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireControlPermission.mockResolvedValue({ user: { id: "admin-user-123" } });
  });

  it("requires explicit confirmation before disabling an account", async () => {
    const result = await setCustomerAccountDeleted(
      initialCustomerLifecycleActionState,
      lifecycleForm({ deleted: "true" })
    );

    expect(result).toEqual({
      status: "error",
      message: "Confirm account disable before continuing",
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("disables the linked auth identity and records an audited soft delete", async () => {
    const fake = fakeLifecycleClient({
      customer: activeCustomer(),
      appMetadata: { plan: "retail" },
    });
    mocks.createServiceClient.mockReturnValue(fake.supabase);

    const result = await setCustomerAccountDeleted(
      initialCustomerLifecycleActionState,
      lifecycleForm({ deleted: "true", confirmDisable: "yes" })
    );

    expect(result).toEqual({ status: "success", message: "Account disabled" });
    expect(fake.authUpdates[0]).toMatchObject({
      ban_duration: "876000h",
      app_metadata: {
        plan: "retail",
        marketplace_account_deleted_at: expect.any(String),
      },
    });
    expect(fake.customerUpdates[0]).toMatchObject({
      deleted_at: expect.any(String),
      deletion_actor: "staff:admin-user-123",
      restored_at: null,
      restoration_actor: null,
      marketing_opt_in: false,
    });
    expect(fake.auditRows[0]).toMatchObject({
      action: "CONTROL_CUSTOMER_DISABLE",
      record_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/control/customers");
  });

  it("restores an account by unbanning the same auth identity", async () => {
    const fake = fakeLifecycleClient({
      customer: deletedCustomer(),
      activeStaff: true,
      appMetadata: {
        plan: "retail",
        marketplace_account_deleted_at: "2026-07-16T12:00:00.000Z",
      },
    });
    mocks.createServiceClient.mockReturnValue(fake.supabase);

    const result = await setCustomerAccountDeleted(
      initialCustomerLifecycleActionState,
      lifecycleForm({ deleted: "false" })
    );

    expect(result).toEqual({ status: "success", message: "Account restored" });
    expect(fake.authUpdates[0]).toEqual({
      ban_duration: "none",
      app_metadata: { plan: "retail" },
    });
    expect(fake.customerUpdates[0]).toMatchObject({
      deleted_at: null,
      deletion_actor: null,
      restored_at: expect.any(String),
      restoration_actor: "staff:admin-user-123",
    });
    expect(fake.auditRows[0]).toMatchObject({
      action: "CONTROL_CUSTOMER_RESTORE",
      record_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("blocks customer-side disabling of an active staff identity", async () => {
    const fake = fakeLifecycleClient({
      customer: activeCustomer(),
      activeStaff: true,
    });
    mocks.createServiceClient.mockReturnValue(fake.supabase);

    const result = await setCustomerAccountDeleted(
      initialCustomerLifecycleActionState,
      lifecycleForm({ deleted: "true", confirmDisable: "yes" })
    );

    expect(result).toEqual({
      status: "error",
      message: "Active staff accounts must be managed from Administrators",
    });
    expect(fake.updateUserById).not.toHaveBeenCalled();
    expect(fake.customerUpdates).toHaveLength(0);
  });

  it("rolls back the auth ban when the customer record update fails", async () => {
    const fake = fakeLifecycleClient({
      customer: activeCustomer(),
      appMetadata: { plan: "retail" },
      customerUpdateError: "database unavailable",
    });
    mocks.createServiceClient.mockReturnValue(fake.supabase);

    const result = await setCustomerAccountDeleted(
      initialCustomerLifecycleActionState,
      lifecycleForm({ deleted: "true", confirmDisable: "yes" })
    );

    expect(result).toEqual({
      status: "error",
      message: "Customer disable failed: database unavailable",
    });
    expect(fake.updateUserById).toHaveBeenCalledTimes(2);
    expect(fake.authUpdates[0]).toMatchObject({ ban_duration: "876000h" });
    expect(fake.authUpdates[1]).toEqual({
      ban_duration: "none",
      app_metadata: { plan: "retail" },
    });
    expect(fake.auditRows).toHaveLength(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

type CustomerRow = {
  id: string;
  auth_user_id: string | null;
  deleted_at: string | null;
};

type FakeLifecycleOptions = {
  customer: CustomerRow;
  activeStaff?: boolean;
  appMetadata?: Record<string, unknown>;
  authUpdateError?: string;
  customerUpdateError?: string;
  rollbackError?: string;
};

function fakeLifecycleClient(options: FakeLifecycleOptions) {
  const authUpdates: Array<Record<string, unknown>> = [];
  const customerUpdates: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  let customerCalls = 0;

  const updateUserById = vi.fn(async (_userId: string, values: Record<string, unknown>) => {
    authUpdates.push(values);
    if (authUpdates.length === 1 && options.authUpdateError) {
      return { error: { message: options.authUpdateError } };
    }
    if (authUpdates.length > 1 && options.rollbackError) {
      return { error: { message: options.rollbackError } };
    }
    return { error: null };
  });

  const supabase = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              app_metadata: options.appMetadata ?? {},
            },
          },
          error: null,
        })),
        updateUserById,
      },
    },
    from: vi.fn((table: string) => {
      if (table === "customers") {
        customerCalls += 1;
        if (customerCalls === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: options.customer, error: null })),
              })),
            })),
          };
        }

        return {
          update: vi.fn((values: Record<string, unknown>) => {
            customerUpdates.push(values);
            return {
              eq: vi.fn(async () => ({
                error: options.customerUpdateError
                  ? { message: options.customerUpdateError }
                  : null,
              })),
            };
          }),
        };
      }

      if (table === "staff_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.activeStaff ? { id: "staff-123" } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (values: Record<string, unknown>) => {
            auditRows.push(values);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    supabase,
    updateUserById,
    authUpdates,
    customerUpdates,
    auditRows,
  };
}

function lifecycleForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    customerId: "11111111-1111-4111-8111-111111111111",
    deleted: "false",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function activeCustomer(): CustomerRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    auth_user_id: "customer-auth-123",
    deleted_at: null,
  };
}

function deletedCustomer(): CustomerRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    auth_user_id: "customer-auth-123",
    deleted_at: "2026-07-16T12:00:00.000Z",
  };
}
