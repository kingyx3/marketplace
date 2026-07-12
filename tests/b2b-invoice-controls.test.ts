import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("B2B invoice production controls", () => {
  it("serializes exposure checks and requires configured terms and references", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260711020000_b2b_invoice_credit_controls.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("from public.b2b_accounts a");
    expect(migration).toContain("for update");
    expect(migration).toContain("invoice credit limit exceeded");
    expect(migration).toContain("purchase order reference already used");
    expect(migration).toContain("b2b invoice checkout is not configured");
    expect(migration).toContain("allocation_expires_at");
    expect(migration).toContain("expire_stale_invoice_orders");
  });

  it("schedules hourly expiry in Supabase without a Vercel cron", async () => {
    const vercel = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    ) as { crons?: Array<{ path: string; schedule: string }> };
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260712000000_schedule_invoice_expiry_cron.sql",
        import.meta.url
      ),
      "utf8"
    );
    const route = await readFile(
      new URL("../app/api/cron/invoice-expiry/route.ts", import.meta.url),
      "utf8"
    );

    expect(vercel.crons).toBeUndefined();
    expect(migration).toContain("from pg_available_extensions");
    expect(migration).toContain("where name = 'pg_cron'");
    expect(migration).toContain("create extension if not exists pg_cron schema pg_catalog");
    expect(migration).toContain("pg_cron is unavailable; skipping invoice expiry schedule");
    expect(migration).toContain("expire-stale-invoice-orders-hourly");
    expect(migration).toContain("7 * * * *");
    expect(migration).toContain("expire_stale_invoice_orders(500)");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("expire_stale_invoice_orders");
  });

  it("provides an active-staff-only credit configuration API", async () => {
    const route = await readFile(
      new URL("../app/api/admin/b2b/[id]/credit/route.ts", import.meta.url),
      "utf8"
    );

    expect(route).toContain("requireApiAdmin");
    expect(route).toContain("admin_set_b2b_credit_terms");
    expect(route).toContain("creditLimitCents");
    expect(route).toContain("NET1 through NET90");
  });
});
