import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { GrantRecord } from "@/app/(shop)/control/_components/administrator-grant-form";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import {
  administratorIdentityLabel,
  administratorRoleLabel,
  administratorSystemStatus,
  isAdministratorIdentifier,
  parseAdministratorIdentity,
  parseAdministratorRole,
  parseAdministratorSort,
  parseAdministratorStatus,
  type AdministratorIdentityFilter,
  type AdministratorRoleFilter,
  type AdministratorSort,
  type AdministratorStatusFilter,
} from "@/lib/control-governance-view";
import type { StaffRole } from "@/lib/admin-staff";
import { createSecretClient } from "@/lib/supabase";

interface StaffRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
  source: "database" | "environment";
  created_at: string;
  last_seen_at: string | null;
}

interface AdministratorSearchParams {
  q?: string;
  status?: string;
  identity?: string;
  role?: string;
  sort?: string;
  page?: string;
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function ControlAdministratorsPage({
  searchParams,
}: {
  searchParams?: Promise<AdministratorSearchParams>;
}) {
  const { staff: currentStaff } = await requireControlPermission(
    "governance.view",
    "/control/governance/administrators"
  );
  const canManage = hasControlPermission(currentStaff, "governance.manage");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const status = parseAdministratorStatus(params.status);
  const identity = parseAdministratorIdentity(params.identity);
  const role = parseAdministratorRole(params.role);
  const sort = parseAdministratorSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = createSecretClient();

  let grantRequest = supabase
    .from("admin_access_grants")
    .select(
      "id, email, role, active, auth_user_id, created_by_staff_id, accepted_at, created_at, updated_at, admin_access_grant_permissions(permission_key)",
      { count: "exact" }
    );

  if (status === "active") grantRequest = grantRequest.eq("active", true);
  if (status === "revoked") grantRequest = grantRequest.eq("active", false);
  if (identity === "pending") grantRequest = grantRequest.is("auth_user_id", null);
  if (identity === "accepted") grantRequest = grantRequest.not("auth_user_id", "is", null);
  if (role !== "all") grantRequest = grantRequest.eq("role", role);
  if (query) {
    if (isAdministratorIdentifier(query)) {
      grantRequest = grantRequest.or(`id.eq.${query},auth_user_id.eq.${query}`);
    } else {
      const safeQuery = query.replace(/[,%_]/g, " ").trim();
      if (safeQuery) grantRequest = grantRequest.ilike("email", `%${safeQuery}%`);
    }
  }

  if (sort === "updated_desc") {
    grantRequest = grantRequest.order("updated_at", { ascending: false });
  } else if (sort === "updated_asc") {
    grantRequest = grantRequest.order("updated_at", { ascending: true });
  } else if (sort === "email") {
    grantRequest = grantRequest.order("email", { ascending: true });
  } else {
    grantRequest = grantRequest
      .order("active", { ascending: false })
      .order("accepted_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: false });
  }

  const [staffResult, grantResult, pendingResult] = await Promise.all([
    supabase
      .from("staff_users")
      .select("id, auth_user_id, email, role, active, source, created_at, last_seen_at")
      .eq("source", "environment")
      .order("created_at"),
    grantRequest.range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from("admin_access_grants")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .is("auth_user_id", null),
  ]);

  if (staffResult.error) throw new Error(`Staff list failed: ${staffResult.error.message}`);
  if (grantResult.error)
    throw new Error(`Administrator grant list failed: ${grantResult.error.message}`);
  if (pendingResult.error)
    throw new Error(`Pending administrator count failed: ${pendingResult.error.message}`);

  const environmentOwners = (staffResult.data ?? []) as StaffRow[];
  const grants = (grantResult.data ?? []) as unknown as GrantRecord[];
  const total = grantResult.count ?? grants.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const normalizedFilters = { query, status, identity, role, sort };
  if (page > totalPages) redirect(administratorPageHref(normalizedFilters, totalPages));

  const pendingCount = pendingResult.count ?? 0;
  const revokedOnPage = grants.filter((grant) => !grant.active).length;
  const hasActiveFilters =
    Boolean(query) || status !== "all" || identity !== "all" || role !== "all" || sort !== "action";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">Acting as {currentStaff.role}</StatusBadge>
            {canManage ? (
              <ControlPrimaryLink href="/control/governance/administrators/new">
                Create administrator
              </ControlPrimaryLink>
            ) : null}
          </>
        }
        description="Find exact access records, review identity acceptance and effective coverage, and open the grant before changing authority."
        eyebrow="Control"
        title="Administrators"
      />

      {pendingCount > 0 ? (
        <section
          aria-labelledby="pending-administrators-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-amber-950" id="pending-administrators-title">
              {pendingCount} active invitation{pendingCount === 1 ? "" : "s"} await first sign-in
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Pending grants have not yet bound to an Auth identity. Verify the invitation email and
              intended coverage before access is accepted.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-amber-400 bg-white px-4 text-sm font-semibold text-amber-950 hover:border-amber-600"
            href="/control/governance/administrators?status=active&identity=pending"
          >
            Review pending invitations
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Matching grants"
          value={String(total)}
          detail="Current search and filters"
        />
        <MetricCard
          label="Visible grants"
          value={String(grants.length)}
          detail={`Page ${page} of ${totalPages}`}
        />
        <MetricCard
          label="Pending invitations"
          value={String(pendingCount)}
          detail="Active and not identity-bound"
        />
        <MetricCard
          label="Revoked on page"
          value={String(revokedOnPage)}
          detail="Retained for access history"
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Environment owners</h2>
          <span className="text-sm text-zinc-500">{environmentOwners.length}</span>
        </div>
        {environmentOwners.length === 0 ? (
          <ControlEmptyState
            description="ADMIN_EMAIL_ALLOWLIST remains authoritative even when an owner has not signed in yet."
            title="No environment owner has signed in"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {environmentOwners.map((owner) => (
              <article
                key={owner.id}
                className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-all font-semibold text-zinc-950">
                      {owner.email ?? "Email pending"}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-emerald-800">
                      System: {owner.active ? "active" : "inactive"} · environment
                    </p>
                  </div>
                  <StatusBadge tone="success">Protected owner</StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <ControlData label="Staff ID" value={<Identifier value={owner.id} />} />
                  <ControlData
                    label="Auth user ID"
                    value={<Identifier value={owner.auth_user_id} />}
                  />
                  <ControlData
                    label="Last seen"
                    value={owner.last_seen_at ? formatDate(owner.last_seen_at) : "Not recorded"}
                  />
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_10rem_11rem_10rem_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search grants
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Email, grant ID, or Auth user ID"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Access state
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Identity
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={identity}
            name="identity"
          >
            <option value="all">All identities</option>
            <option value="pending">Pending sign-in</option>
            <option value="accepted">Accepted</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Role template
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={role}
            name="role"
          >
            <option value="all">All roles</option>
            <option value="viewer">Viewer</option>
            <option value="support">Support</option>
            <option value="catalog">Catalog</option>
            <option value="operations">Operations</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="action">Action required first</option>
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Oldest update first</option>
            <option value="email">Email</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active administrator filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {status !== "all" ? <FilterChip>Access: {status}</FilterChip> : null}
          {identity !== "all" ? <FilterChip>Identity: {identity}</FilterChip> : null}
          {role !== "all" ? <FilterChip>Role: {administratorRoleLabel(role)}</FilterChip> : null}
          {sort !== "action" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link
            className="ml-auto font-semibold underline"
            href="/control/governance/administrators"
          >
            Clear all
          </Link>
        </aside>
      ) : null}

      {grants.length === 0 ? (
        <ControlEmptyState
          action={
            hasActiveFilters ? (
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                href="/control/governance/administrators"
              >
                Clear filters
              </Link>
            ) : canManage ? (
              <ControlPrimaryLink href="/control/governance/administrators/new">
                Create administrator
              </ControlPrimaryLink>
            ) : undefined
          }
          description="Broaden the search or clear one of the access, identity, or role filters."
          title="No delegated grants match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Delegated access</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Invitation email leads; exact grant and identity references remain available for
                access review and audit correlation.
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              {total} result{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {grants.map((grant) => (
              <Link
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                href={`/control/governance/administrators/${grant.id}`}
                key={grant.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="break-all font-semibold text-zinc-950">{grant.email}</h3>
                    <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
                      <div>
                        <dt className="inline font-medium">Grant ID </dt>
                        <dd className="inline select-all font-mono">{grant.id}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Auth user ID </dt>
                        <dd className="inline select-all font-mono">
                          {grant.auth_user_id ?? "Not yet bound"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="grid justify-items-end gap-2">
                    <StatusBadge tone={grant.active ? "success" : "danger"}>
                      {grant.active ? "Access active" : "Access revoked"}
                    </StatusBadge>
                    <StatusBadge tone={grant.auth_user_id ? "info" : "warning"}>
                      {administratorIdentityLabel(grant.auth_user_id)}
                    </StatusBadge>
                    <p className="font-mono text-xs text-zinc-400">
                      System: {administratorSystemStatus(grant.active)} ·{" "}
                      {grant.auth_user_id ? "accepted" : "pending"}
                    </p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                  <ControlData label="Role template" value={administratorRoleLabel(grant.role)} />
                  <ControlData
                    label="Permissions"
                    value={String(grant.admin_access_grant_permissions?.length ?? 0)}
                  />
                  <ControlData label="Updated" value={formatDate(grant.updated_at)} />
                  <ControlData
                    label="Next step"
                    value={
                      canManage && grant.active && !grant.auth_user_id
                        ? "Verify invitation →"
                        : "Review coverage →"
                    }
                  />
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Administrator pages" className="flex items-center justify-between gap-3">
          <PaginationLink
            disabled={page <= 1}
            href={administratorPageHref(normalizedFilters, page - 1)}
          >
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={administratorPageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function Identifier({ value }: { value: string }) {
  return <span className="select-all break-all font-mono text-xs">{value}</span>;
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-300 bg-white px-3 py-1">{children}</span>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function administratorPageHref(
  filters: {
    query: string;
    status: AdministratorStatusFilter;
    identity: AdministratorIdentityFilter;
    role: AdministratorRoleFilter;
    sort: AdministratorSort;
  },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.status !== "all") search.set("status", filters.status);
  if (filters.identity !== "all") search.set("identity", filters.identity);
  if (filters.role !== "all") search.set("role", filters.role);
  if (filters.sort !== "action") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value
    ? `/control/governance/administrators?${value}`
    : "/control/governance/administrators";
}

function sortLabel(value: AdministratorSort): string {
  return {
    action: "Action required first",
    updated_desc: "Recently updated",
    updated_asc: "Oldest update first",
    email: "Email",
  }[value];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
