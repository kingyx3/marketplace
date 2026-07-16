import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("customer account management", () => {
  it("keeps sign out and deletion controls on the account page", async () => {
    const [header, accountPage] = await Promise.all([
      readFile(new URL("../app/_components/site-header.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/account/page.tsx", import.meta.url), "utf8"),
    ]);

    expect(header).not.toContain("Home");
    expect(header).not.toContain("Sign out");
    expect(accountPage).toContain('action="/auth/sign-out"');
    expect(accountPage).toContain("Delete account");
    expect(accountPage).toContain("confirmDeletion");
    expect(accountPage.indexOf('action="/auth/sign-out"')).toBeGreaterThan(
      accountPage.indexOf("Recent orders")
    );
  });

  it("soft deletes auth and anonymizes the retained customer record", async () => {
    const [action, pageAuth, apiAuth, migration] = await Promise.all([
      readFile(new URL("../app/actions/account.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260717014500_customer_account_soft_deletion.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(action).toContain("auth.admin.deleteUser(user.id, true)");
    expect(action).toContain("deleted_at: deletedAt");
    expect(action).toContain("auth_user_id: null");
    expect(action).toContain("marketing_opt_in: false");
    expect(action).not.toContain('.from("customers").delete()');
    expect(pageAuth).toContain('.is("deleted_at", null)');
    expect(apiAuth.match(/\.is\("deleted_at", null\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("add column if not exists deleted_at timestamptz");
  });
});
