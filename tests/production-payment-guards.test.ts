import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production payment and preorder guards", () => {
  it("serializes order payment transitions and binds payment references", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260711000000_lock_order_payment_transition.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("where id = p_order_id\n  for update");
    expect(migration).toContain("payment reference belongs to another record");
    expect(migration).toContain("public.payments.order_id = excluded.order_id");
  });

  it("keeps generic admin preorder status mutation disabled", async () => {
    const route = await readFile(
      new URL("../app/api/admin/preorders/[id]/route.ts", import.meta.url),
      "utf8"
    );

    expect(route).toContain("PREORDER_STATE_TRANSITION_UNSUPPORTED");
    expect(route).not.toContain("updateAdminPreorder");
    expect(route).not.toContain("readJsonBody");
  });

  it("allows only the configured Supabase public storage path for product images", async () => {
    const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

    expect(config).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(config).toContain("/storage/v1/object/public/**");
    expect(config).not.toContain("hostname: \"**\"");
  });
});
