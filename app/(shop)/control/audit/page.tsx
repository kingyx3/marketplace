import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

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

export const dynamic = "force-dynamic";

export default async function ControlAuditPage() {
  await requireControlPermission("view_audit", "/control/audit");
  const { data, error } = await createServiceClient()
    .from("audit_logs")
    .select("id, actor, table_name, record_id, action, old_data, new_data, created_at")
    .or("action.like.CONTROL_%,action.like.ADMIN_%")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Audit log read failed: ${error.message}`);
  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Security</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Audit log</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Recent explicit administrative actions. Sensitive fields are not rendered in this view.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">No administrative audit records are available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-4 text-zinc-600">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-4 font-semibold text-zinc-950">
                      {row.action.replaceAll("_", " ").toLowerCase()}
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      <p>{row.table_name}</p>
                      <p className="mt-1 max-w-48 truncate font-mono text-xs text-zinc-500">
                        {row.record_id ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-600">{row.actor ?? "service"}</td>
                    <td className="px-4 py-4 text-zinc-600">{summarizeAuditData(row.new_data ?? row.old_data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function summarizeAuditData(data: Record<string, unknown> | null): string {
  if (!data) return "No structured details";
  const allowedKeys = [
    "name",
    "slug",
    "code",
    "role",
    "active",
    "status",
    "category_id",
    "parent_id",
    "product_id",
    "sku_id",
    "supplier_id",
    "deal_id",
  ];
  const entries = allowedKeys
    .filter((key) => key in data)
    .map((key) => `${key.replaceAll("_", " ")}: ${formatValue(data[key])}`);
  return entries.length > 0 ? entries.join(" · ") : "Details retained in the protected database log";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "updated";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
