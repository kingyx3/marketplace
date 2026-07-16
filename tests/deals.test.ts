import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  adminLimitedTimeDealFromForm,
  adminLimitedTimeDealStatusFromForm,
} from "@/lib/admin-listing-forms";
import {
  calculateDealSavings,
  discountedDealPrice,
  formatDealDiscount,
  PUBLIC_DEAL_PREVIEW_LIMIT,
} from "@/lib/deals";

describe("limited-time deals", () => {
  it("calculates integer-cent savings and enforces a small public preview", () => {
    expect(PUBLIC_DEAL_PREVIEW_LIMIT).toBe(3);
    expect(calculateDealSavings(19900, 750)).toBe(1492);
    expect(discountedDealPrice(19900, 750)).toBe(18408);
    expect(formatDealDiscount(750)).toBe("7.50%");
  });

  it("normalizes and validates staff deal forms in Singapore time", () => {
    const form = validDealForm();
    expect(adminLimitedTimeDealFromForm(form)).toMatchObject({
      dealId: null,
      code: "launch_week",
      discountBps: 750,
      visibility: "public",
      startsAt: "2026-07-16T01:00:00.000Z",
      endsAt: "2026-07-20T10:00:00.000Z",
      active: true,
    });

    form.set("active", "false");
    expect(adminLimitedTimeDealFromForm(form).active).toBe(false);

    form.set("endsAt", "2026-07-15T18:00");
    expect(() => adminLimitedTimeDealFromForm(form)).toThrow("deal end must be after its start");
  });

  it("rejects malformed status mutations", () => {
    const form = new FormData();
    form.set("dealId", "not-a-uuid");
    form.set("active", "true");
    expect(() => adminLimitedTimeDealStatusFromForm(form)).toThrow("dealId must be a valid UUID");
  });

  it("protects member metadata with RLS and keeps mutations service-role-only", async () => {
    const [migration, authShim] = await Promise.all([
      readFile(
        new URL("../supabase/migrations/20260716121653_limited_time_deals.sql", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../.github/ci/auth-shim.sql", import.meta.url), "utf8"),
    ]);

    expect(migration).toContain("alter table public.limited_time_deals enable row level security");
    expect(migration).toContain("visibility = 'public'");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("auth.jwt()->>'is_anonymous'");
    expect(migration).toContain("admin_upsert_limited_time_deal");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(authShim).toContain("create or replace function auth.jwt()");
    expect(authShim).toContain("current_setting('request.jwt.claims', true)");
  });
});

function validDealForm(): FormData {
  const form = new FormData();
  form.set("code", "Launch_Week");
  form.set("skuId", "11111111-1111-4111-8111-111111111111");
  form.set("title", "Launch week offer");
  form.set("description", "A real, scheduled promotion.");
  form.set("discountBps", "750");
  form.set("visibility", "public");
  form.set("startsAt", "2026-07-16T09:00");
  form.set("endsAt", "2026-07-20T18:00");
  form.set("sortPriority", "1");
  form.set("active", "on");
  return form;
}
