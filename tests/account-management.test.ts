import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("customer account management", () => {
  it("keeps sign out and deletion controls on the account page", async () => {
    const [header, accountPage, deleteDialog] = await Promise.all([
      readFile(new URL("../app/_components/site-header.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/account/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/account/delete-account-dialog.tsx", import.meta.url), "utf8"),
    ]);

    expect(header).not.toContain("Home");
    expect(header).not.toContain("Sign out");
    expect(accountPage).toContain('action="/auth/sign-out"');
    expect(accountPage).toContain("Delete account");
    expect(accountPage).toContain("Delivery addresses");
    expect(accountPage).toContain("Account settings");
    expect(accountPage.indexOf('action="/auth/sign-out"')).toBeGreaterThan(
      accountPage.indexOf("Order history")
    );
    expect(deleteDialog).toContain("showModal()");
    expect(deleteDialog).toContain("confirmDeletion");
    expect(deleteDialog).toContain('value="yes"');
    expect(deleteDialog).toContain("Yes, delete account");
    expect(deleteDialog).not.toContain('type="checkbox"');
  });

  it("lets customers update profile and marketing preferences", async () => {
    const [accountPage, action] = await Promise.all([
      readFile(new URL("../app/(shop)/account/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/account.ts", import.meta.url), "utf8"),
    ]);

    expect(accountPage).toContain("updateAccountSettings");
    expect(accountPage).toContain('name="marketingOptIn"');
    expect(action).toContain("export async function updateAccountSettings");
    expect(action).toContain("marketing_opt_in");
    expect(action).toContain('revalidatePath("/account")');
  });

  it("uses a reversible application soft delete and blocks deleted-account access", async () => {
    const [action, pageAuth, apiAuth, migration] = await Promise.all([
      readFile(new URL("../app/actions/account.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260717160000_customer_account_soft_deletion.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(action).toContain('ban_duration: "876000h"');
    expect(action).toContain("marketplace_account_deleted_at");
    expect(action).toContain("deleted_at: deletedAt");
    expect(action).toContain("marketing_opt_in: false");
    expect(action).not.toContain("deleteUser(");
    expect(action).not.toContain("auth_user_id: null");
    expect(pageAuth).toContain('.is("deleted_at", null)');
    expect(apiAuth).toContain("assertCustomerActive");
    expect(apiAuth).toContain('forbidden("Customer account is disabled")');
    expect(migration).toContain("deletion_actor text");
    expect(migration).toContain("c.deleted_at is null");
    expect(migration).not.toContain("b2b_accounts");
  });

  it("allows only administrators to disable and restore customer accounts", async () => {
    const [permissions, shell, indexPage, detailPage, control, action] = await Promise.all([
      readFile(new URL("../lib/control-permissions.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/customers/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/customers/[customerId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/customer-lifecycle-control.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(new URL("../app/actions/customer-admin.ts", import.meta.url), "utf8"),
    ]);

    expect(permissions).toContain('"manage_customers"');
    expect(shell).toContain('href: "/control/customers"');
    expect(indexPage).toContain('requireControlPermission("manage_customers"');
    expect(indexPage).toContain("href={`/control/customers/${customer.id}`}");
    expect(indexPage).not.toContain("CustomerLifecycleControl");
    expect(detailPage).toContain('requireControlPermission("manage_customers"');
    expect(detailPage).toContain("CustomerLifecycleControl");
    expect(detailPage).toContain("retained for audit only");
    expect(control).toContain("useActionState");
    expect(control).toContain("Restore account");
    expect(control).toContain('name="confirmDisable"');
    expect(action).toContain('ban_duration: deleted ? LONG_BAN_DURATION : "none"');
    expect(action).toContain('formData.get("confirmDisable") !== "yes"');
    expect(action).toContain("CONTROL_CUSTOMER_RESTORE");
    expect(action).toContain("Active staff accounts must be managed from Administrators");
  });
});
