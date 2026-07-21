import Link from "next/link";

import { ControlEmptyState } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import {
  AUDIT_AREAS,
  AUDIT_PAGE_SIZE,
  AUDIT_SEARCH_DATA_KEYS,
  auditActionLabel,
  auditAreaTables,
  auditChanges,
  auditTableLabel,
  auditTargetName,
  normalizeAuditSearch,
  parseAuditArea,
  resolveAuditActor,
} from "@/lib/control-audit";
import { createSecretClient } from "@/lib/supabase";

interface AuditRow {
  id: string;
  actor: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

interface StaffRow {
  auth_user_id: string;
  email: string | null;
}

type AuditSearchParams = { q?: string; area?: string; sort?: string; page?: string };

export const dynamic = "force-dynamic";

export default async function ControlAuditPage({
  searchParams,
}: {
  searchParams?: Promise<AuditSearchParams>;
}) {
  await requireControlPermission("audit.view", "/control/governance/audit");
  const params = (await searchParams) ?? {};
  const search = normalizeAuditSearch(params.q);
  const area = parseAuditArea(params.area);
  const oldestFirst = params.sort === "oldest";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * AUDIT_PAGE_SIZE;
  const supabase = createSecretClient();

  const staffResult = await supabase
    .from("staff_users")
    .select("auth_user_id, email")
    .not("auth_user_id", "is", null);
  if (staffResult.error) throw new Error(`Audit actor lookup failed: ${staffResult.error.message}`);

  const staffRows = (staffResult.data ?? []) as StaffRow[];
  const staffByAuthUserId = new Map(
    staffRows
      .filter((staff) => staff.email)
      .map((staff) => [staff.auth_user_id, staff.email as string])
  );

  let request = supabase
    .from("audit_logs")
    .select("id, actor, table_name, record_id, action, old_data, new_data, created_at", {
      count: "exact",
    })
    .or("action.like.CONTROL_%,action.like.ADMIN_%");

  const tables = auditAreaTables(area);
  if (tables) request = request.in("table_name", tables);

  if (search) {
    const pattern = `%${search}%`;
    const filters = [
      `action.ilike.${pattern}`,
      `table_name.ilike.${pattern}`,
      `record_id.ilike.${pattern}`,
      `actor.ilike.${pattern}`,
      ...AUDIT_SEARCH_DATA_KEYS.flatMap((key) => [
        `new_data->>${key}.ilike.${pattern}`,
        `old_data->>${key}.ilike.${pattern}`,
      ]),
    ];
    for (const staff of staffRows) {
      if (staff.email?.toLowerCase().includes(search.toLowerCase())) {
        filters.push(
          `actor.eq.staff:${staff.auth_user_id}`,
          `actor.eq.admin:${staff.auth_user_id}`
        );
      }
    }
    request = request.or(filters.join(","));
  }

  const { data, error, count } = await request
    .order("created_at", { ascending: oldestFirst })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);
  if (error) throw new Error(`Audit log read failed: ${error.message}`);

  const rows = (data ?? []) as AuditRow[];
  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const activeAreaLabel = AUDIT_AREAS.find((option) => option.value === area)?.label ?? "All areas";

  return (
    <div className="space-y-8">
      <PageHeader
        description="Find an administrative change by record, identifier, actor, or operational area, then verify its exact system details."
        eyebrow="Security"
        title="Audit history"
      />

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_15rem_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search audit history
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            maxLength={100}
            name="q"
            placeholder="Name, SKU, ID, action, or actor email"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Operational area
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={area}
            name="area"
          >
            {AUDIT_AREAS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={oldestFirst ? "oldest" : "newest"}
            name="sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply filters
        </button>
      </form>

      {search || area !== "all" || oldestFirst ? (
        <div aria-label="Active filters" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-600">Active filters:</span>
          {search ? <FilterIndicator>Search: {search}</FilterIndicator> : null}
          {area !== "all" ? <FilterIndicator>Area: {activeAreaLabel}</FilterIndicator> : null}
          {oldestFirst ? <FilterIndicator>Sort: oldest first</FilterIndicator> : null}
          <Link
            className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            href="/control/governance/audit"
          >
            Clear filters
          </Link>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <ControlEmptyState
          action={
            search || area !== "all" ? (
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                href="/control/governance/audit"
              >
                Clear filters
              </Link>
            ) : undefined
          }
          description={
            search || area !== "all"
              ? "Try a broader identifier, actor, action, or operational area."
              : "Explicit administrative actions will appear here after an operator makes a change."
          }
          title={
            search || area !== "all"
              ? "No audit records match this view"
              : "No audit records are available"
          }
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Administrative changes</h2>
            <span className="text-sm text-zinc-500">
              {total} result{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Activity</th>
                    <th className="px-4 py-3 font-semibold">Affected record</th>
                    <th className="px-4 py-3 font-semibold">Administrator</th>
                    <th className="px-4 py-3 font-semibold">Verified details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((row) => {
                    const record = {
                      tableName: row.table_name,
                      oldData: row.old_data,
                      newData: row.new_data,
                    };
                    const actor = resolveAuditActor(row.actor, staffByAuthUserId);
                    const changes = auditChanges(record);
                    return (
                      <tr key={row.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                          <time dateTime={row.created_at} title={row.created_at}>
                            {formatDate(row.created_at)}
                          </time>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={actionTone(row.action)}>
                            {auditActionLabel(row.action)}
                          </StatusBadge>
                          <code className="mt-2 block select-all text-xs text-zinc-500">
                            {row.action}
                          </code>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-zinc-950">{auditTargetName(record)}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {auditTableLabel(row.table_name)}
                          </p>
                          <p className="mt-2 text-xs text-zinc-500">
                            {auditTableLabel(row.table_name)} ID
                          </p>
                          <code className="block max-w-64 select-all break-all text-xs text-zinc-700">
                            {row.record_id ?? "Not recorded"}
                          </code>
                        </td>
                        <td className="px-4 py-4">
                          <p className="break-all font-medium text-zinc-900">{actor.label}</p>
                          {actor.reference ? (
                            <>
                              <p className="mt-2 text-xs text-zinc-500">Actor reference</p>
                              <code className="block max-w-64 select-all break-all text-xs text-zinc-600">
                                {actor.reference}
                              </code>
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {changes.length > 0 ? (
                            <dl className="grid max-w-md gap-2">
                              {changes.map((change) => (
                                <div key={change.label}>
                                  <dt className="text-xs font-medium text-zinc-500">
                                    {change.label}
                                  </dt>
                                  <dd className="select-all break-words">{change.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="max-w-sm text-zinc-500">
                              No safe operational fields are available in this summary. Full
                              before-and-after data remains in the protected audit record.
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Audit history pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={pageHref(params, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink disabled={page >= totalPages} href={pageHref(params, page + 1)}>
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function FilterIndicator({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
      {children}
    </span>
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

function pageHref(params: AuditSearchParams, page: number): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.area) search.set("area", params.area);
  if (params.sort) search.set("sort", params.sort);
  search.set("page", String(page));
  return `/control/governance/audit?${search.toString()}`;
}

function actionTone(action: string) {
  if (/ARCHIVE|CANCEL|DISABLE|REFUND|REVOKE/.test(action)) return "danger" as const;
  if (/CREATE|RESTORE|FINALIZE|ARRANGE/.test(action)) return "success" as const;
  if (/STAGE|ADJUST|RECONCILIATION/.test(action)) return "warning" as const;
  return "info" as const;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
