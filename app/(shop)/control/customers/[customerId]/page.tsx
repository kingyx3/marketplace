import { notFound } from "next/navigation";

import { CustomerLifecycleControl } from "@/app/(shop)/control/_components/customer-lifecycle-control";
import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import {
  customerAccountLabel,
  customerAccountSystemStatus,
  customerProvisioningLabel,
} from "@/lib/control-customer-view";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface CustomerRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  provisioning_state: string;
  deleted_at: string | null;
  deletion_actor: string | null;
  restored_at: string | null;
  restoration_actor: string | null;
  created_at: string;
  updated_at: string;
  orders: Array<{ id: string }> | null;
  preorders: Array<{ id: string }> | null;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const { staff } = await requireControlPermission(
    "customers.view",
    `/control/customers/${customerId}`
  );
  const { data, error } = await createSecretClient()
    .from("customers")
    .select(
      "id, auth_user_id, email, name, provisioning_state, deleted_at, deletion_actor, restored_at, restoration_actor, created_at, updated_at, orders(id), preorders(id)"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(`Customer lookup failed: ${error.message}`);
  if (!data) notFound();

  const customer = data as unknown as CustomerRow;
  const deleted = Boolean(customer.deleted_at);
  const recoverable = Boolean(customer.auth_user_id);

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={deleted ? "danger" : "success"}>
              {customerAccountLabel(customer.deleted_at)}
            </StatusBadge>
            <StatusBadge tone={provisioningTone(customer.provisioning_state)}>
              {customerProvisioningLabel(customer.provisioning_state)}
            </StatusBadge>
            <ControlBackLink href="/control/customers">Back to customers</ControlBackLink>
          </>
        }
        description={customer.email}
        eyebrow="Control · Customer"
        title={customer.name || "Customer"}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Orders" value={String(customer.orders?.length ?? 0)} />
        <Summary label="Preorders" value={String(customer.preorders?.length ?? 0)} />
        <Summary
          label="Provisioning"
          value={customerProvisioningLabel(customer.provisioning_state)}
        />
        <Summary label="Created" value={formatDate(customer.created_at)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-zinc-950">Account lifecycle</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <ControlData
            label="Customer ID"
            value={<span className="select-all font-mono text-xs">{customer.id}</span>}
          />
          <ControlData
            label="Auth user ID"
            value={
              customer.auth_user_id ? (
                <span className="select-all font-mono text-xs">{customer.auth_user_id}</span>
              ) : (
                "Not linked"
              )
            }
          />
          <ControlData
            label="System status"
            value={
              <span className="font-mono text-xs">
                {customerAccountSystemStatus(customer.deleted_at)} · {customer.provisioning_state}
              </span>
            }
          />
          <ControlData label="Updated" value={formatDateTime(customer.updated_at)} />
          <ControlData
            label="Access disabled"
            value={customer.deleted_at ? formatDateTime(customer.deleted_at) : "No"}
          />
          <ControlData label="Disable actor" value={customer.deletion_actor ?? "Not recorded"} />
          <ControlData
            label="Restored"
            value={customer.restored_at ? formatDateTime(customer.restored_at) : "Not recorded"}
          />
          <ControlData
            label="Restoration actor"
            value={customer.restoration_actor ?? "Not recorded"}
          />
        </dl>

        {deleted && !recoverable ? (
          <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
            No linked Auth identity is available. This record is retained for audit only.
          </div>
        ) : null}

        {hasControlPermission(staff, "customers.manage") ? (
          <CustomerLifecycleControl
            customerId={customer.id}
            deleted={deleted}
            recoverable={recoverable}
          />
        ) : (
          <p className="mt-5 text-sm text-zinc-500">
            Account lifecycle controls are read only for your current coverage.
          </p>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(value));
}

function provisioningTone(value: string) {
  if (value === "error") return "danger" as const;
  if (value === "pending") return "warning" as const;
  return "success" as const;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
