import { readFile } from "node:fs/promises";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { findOrCreateCustomer, type CustomerRecord } from "@/lib/api/auth";

describe("customer provisioning", () => {
  it("repairs a legacy customer row that predates the auth trigger", async () => {
    const store = fakeCustomerStore([
      customer({ auth_user_id: null, email: "buyer@example.test", name: "Existing Buyer" }),
    ]);

    const result = await findOrCreateCustomer(store.client, authUser());

    expect(result).toMatchObject({
      auth_user_id: "auth-user-123",
      email: "buyer@example.test",
      name: "Existing Buyer",
    });
    expect(store.rows).toHaveLength(1);
  });

  it("creates a customer for an authenticated Google user when no row exists", async () => {
    const store = fakeCustomerStore();

    const result = await findOrCreateCustomer(
      store.client,
      authUser({
        email: " Buyer@Example.Test ",
        user_metadata: { full_name: "  Google Buyer  " },
      })
    );

    expect(result).toMatchObject({
      auth_user_id: "auth-user-123",
      email: "buyer@example.test",
      name: "Google Buyer",
      provisioning_state: "active",
    });
    expect(store.rows).toHaveLength(1);
  });

  it("returns an existing customer already linked to the auth user", async () => {
    const existing = customer({
      auth_user_id: "auth-user-123",
      email: "original@example.test",
      name: "Original Buyer",
    });
    const store = fakeCustomerStore([existing]);

    const result = await findOrCreateCustomer(
      store.client,
      authUser({ email: "changed@example.test" })
    );

    expect(result).toEqual(existing);
    expect(store.rows).toHaveLength(1);
  });

  it("rejects a disabled legacy customer instead of relinking or duplicating it", async () => {
    const store = fakeCustomerStore([
      customer({
        auth_user_id: null,
        email: "buyer@example.test",
        deleted_at: "2026-07-16T12:00:00.000Z",
      }),
    ]);

    await expect(findOrCreateCustomer(store.client, authUser())).rejects.toThrow(
      "Customer account is disabled"
    );
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.auth_user_id).toBeNull();
  });

  it("does not relink an email owned by another auth user", async () => {
    const store = fakeCustomerStore([
      customer({ auth_user_id: "other-auth-user", email: "buyer@example.test" }),
    ]);

    await expect(findOrCreateCustomer(store.client, authUser())).rejects.toThrow(
      "Email is already linked to another account"
    );
  });

  it("wires browser-session account access through idempotent provisioning", async () => {
    const source = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");

    expect(source).toContain("findOrCreateCustomer(createServiceClient(), user)");
    expect(source).not.toContain(
      'throw new AuthenticationError("Customer profile has not been provisioned")'
    );
  });
});

function authUser(overrides: Partial<User> = {}): User {
  return {
    id: "auth-user-123",
    email: "buyer@example.test",
    user_metadata: { name: "Buyer" },
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  } as User;
}

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "customer-123",
    auth_user_id: null,
    email: "buyer@example.test",
    name: "Buyer",
    phone: null,
    segment: "player",
    default_currency: "SGD",
    marketing_opt_in: false,
    provisioning_state: "active",
    provisioning_error: null,
    deleted_at: null,
    ...overrides,
  };
}

function fakeCustomerStore(initial: CustomerRecord[] = []) {
  const rows = initial.map((row) => ({ ...row }));

  const client = {
    from(table: string) {
      if (table !== "customers") throw new Error(`Unexpected table: ${table}`);

      const filters: Array<[keyof CustomerRecord, unknown]> = [];
      let operation: "select" | "update" | "insert" = "select";
      let updateValues: Partial<CustomerRecord> = {};
      let insertValues: Partial<CustomerRecord> = {};

      const builder = {
        select() {
          return builder;
        },
        eq(column: keyof CustomerRecord, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        is(column: keyof CustomerRecord, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        update(values: Partial<CustomerRecord>) {
          operation = "update";
          updateValues = values;
          return builder;
        },
        insert(values: Partial<CustomerRecord>) {
          operation = "insert";
          insertValues = values;
          return builder;
        },
        async maybeSingle() {
          const matches = matchingRows(rows, filters);
          return { data: matches[0] ?? null, error: null };
        },
        async single() {
          if (operation === "update") {
            const target = matchingRows(rows, filters)[0];
            if (!target) return { data: null, error: { message: "customer not found" } };
            Object.assign(target, updateValues);
            return { data: target, error: null };
          }

          if (operation === "insert") {
            const inserted = customer({
              id: `customer-${rows.length + 1}`,
              ...insertValues,
            });
            rows.push(inserted);
            return { data: inserted, error: null };
          }

          const target = matchingRows(rows, filters)[0];
          return target
            ? { data: target, error: null }
            : { data: null, error: { message: "customer not found" } };
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rows };
}

function matchingRows(
  rows: CustomerRecord[],
  filters: Array<[keyof CustomerRecord, unknown]>
): CustomerRecord[] {
  return rows.filter((row) => filters.every(([column, value]) => row[column] === value));
}
