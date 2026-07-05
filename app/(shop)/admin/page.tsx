import Link from "next/link";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  approveWholesale,
  recordSupplierPurchaseOrder,
  rejectWholesale,
  removeWholesalePricingTier,
  runAdminOrderAction,
  runPreorderAllocation,
  updateInventory,
} from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listAdminOrderExceptions, type AdminOrderException } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

interface AdminInventoryRow {
  skuId: string;
  sku: string;
  productName: string;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
  available: number;
}

interface AdminB2bApplication {
  id: string;
  companyName: string;
  businessRegNo: string | null;
  customerName: string | null;
  customerEmail: string | null;
  createdAt: string;
}

interface AdminB2bTierAssignment {
  accountId: string;
  customerId: string;
  companyName: string;
  customerEmail: string | null;
  customerName: string | null;
  tierId: string;
  tierName: string;
  tierCode: string;
  discountBps: number;
  minOrderCents: number;
}

interface AdminPurchaseOrderRow {
  id: string;
  status: string;
  supplier: string;
  expectedAt: string | null;
  boxes: number;
  valueCents: number;
  currency: string;
}

interface AdminPricingTier {
  id: string;
  name: string;
  code: string;
  discountBps: number;
  minOrderCents: number;
  currency: string;
}

interface AdminSupplierOption {
  id: string;
  name: string;
  currency: string;
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { staff } = await requireStaff("/admin");
  const supabase = createServiceClient();
  const [
    inventoryRows,
    exceptions,
    b2bApplications,
    approvedB2bTierAssignments,
    purchaseOrders,
    pricingTiers,
    suppliers,
  ] = await Promise.all([
    fetchInventoryRows(supabase),
    listAdminOrderExceptions(supabase),
    fetchPendingB2bApplications(supabase),
    fetchApprovedB2bTierAssignments(supabase),
    fetchPurchaseOrders(supabase),
    fetchPricingTiers(supabase),
    fetchSupplierOptions(supabase),
  ]);
  const metrics = adminMetricsFrom({ inventoryRows, exceptions, b2bApplications });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Operator workspace"
        description="Inventory, purchase orders, allocation queues, and wholesale reviews share one operational surface for sealed-product fulfillment."
        action={<StatusBadge tone="success">Staff verified: {staff.role}</StatusBadge>}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-zinc-950">Inventory</h2>
              <Link
                href="/catalog"
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Open catalog
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Product</th>
                    <th className="py-3 pr-4 font-medium">SKU</th>
                    <th className="py-3 pr-4 font-medium">Stock update</th>
                    <th className="py-3 pr-4 font-medium">Incoming</th>
                    <th className="py-3 pr-4 font-medium">Allocated</th>
                    <th className="py-3 pr-4 font-medium">Available</th>
                    <th className="py-3 pr-4 font-medium">Preorders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inventoryRows.map((row) => (
                    <tr key={row.skuId}>
                      <td className="py-4 pr-4 font-semibold text-zinc-950">{row.productName}</td>
                      <td className="py-4 pr-4 text-zinc-600">{row.sku}</td>
                      <td className="py-4 pr-4 text-zinc-600">
                        <form
                          action={updateInventory}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="skuId" value={row.skuId} />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} on hand`}
                            defaultValue={row.onHand}
                            min={0}
                            name="onHand"
                            type="number"
                          />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} incoming`}
                            defaultValue={row.incoming}
                            min={0}
                            name="incoming"
                            type="number"
                          />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} safety stock`}
                            defaultValue={row.safetyStock}
                            min={0}
                            name="safetyStock"
                            type="number"
                          />
                          <button className="h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="py-4 pr-4 text-zinc-600">{row.incoming}</td>
                      <td className="py-4 pr-4 text-zinc-600">{row.allocated}</td>
                      <td className="py-4 pr-4">
                        <StatusBadge tone={row.available > 0 ? "success" : "warning"}>
                          {row.available}
                        </StatusBadge>
                      </td>
                      <td className="py-4 pr-4">
                        <form action={runPreorderAllocation}>
                          <input type="hidden" name="skuId" value={row.skuId} />
                          <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                            Allocate
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Purchase orders</h2>
            <PurchaseOrderIntakeForm suppliers={suppliers} skus={inventoryRows} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {purchaseOrders.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                  No purchase orders yet.
                </p>
              ) : (
                purchaseOrders.map((po) => (
                  <article key={po.id} className="rounded-md border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-zinc-950">{po.id}</h3>
                      <StatusBadge tone={po.status === "confirmed" ? "success" : "info"}>
                        {po.status}
                      </StatusBadge>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Supplier</dt>
                        <dd className="font-semibold text-zinc-950">{po.supplier}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Expected</dt>
                        <dd className="font-semibold text-zinc-950">
                          {po.expectedAt ?? "Unscheduled"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Boxes</dt>
                        <dd className="font-semibold text-zinc-950">{po.boxes}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Value</dt>
                        <dd className="font-semibold text-zinc-950">
                          {formatMoney(po.valueCents, po.currency)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Payment exceptions</h2>
            <ManualReconciliationForm />
            <div className="mt-5 grid gap-3">
              {exceptions.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                  No open payment exceptions.
                </p>
              ) : (
                exceptions.slice(0, 6).map((exception) => (
                  <article key={exception.key} className="rounded-md border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-zinc-950">
                        {formatExceptionType(exception.exceptionType)}
                      </h3>
                      <StatusBadge tone={exceptionTone(exception.severity)}>
                        {exception.severity}
                      </StatusBadge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">{exception.detail}</p>
                    <dl className="mt-3 grid gap-2 text-xs text-zinc-500">
                      <div className="flex justify-between gap-4">
                        <dt>Order</dt>
                        <dd>{exception.orderId ?? "None"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Payment</dt>
                        <dd>{exception.paymentId ?? exception.providerPaymentId ?? "None"}</dd>
                      </div>
                    </dl>
                    {exception.orderId ? (
                      <div className="mt-4 grid gap-3">
                        {exception.providerPaymentId ? (
                          <ManualReconciliationForm
                            compact
                            defaultOrderId={exception.orderId}
                            defaultProviderPaymentId={exception.providerPaymentId}
                            defaultReason={`Resolve ${formatExceptionType(exception.exceptionType)}`}
                          />
                        ) : null}
                        {exception.exceptionType === "failed_payment_allocation" ? (
                          <form action={runAdminOrderAction} className="grid gap-2">
                            <input type="hidden" name="action" value="cancel_unpaid" />
                            <input type="hidden" name="orderId" value={exception.orderId} />
                            <input
                              type="hidden"
                              name="reason"
                              value="Cancelled from payment exception queue after failed payment"
                            />
                            <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:border-rose-400">
                              Cancel unpaid order
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Wholesale applications</h2>
            <div className="mt-5 grid gap-3">
              {b2bApplications.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                  No pending wholesale applications.
                </p>
              ) : (
                b2bApplications.map((application) => (
                  <article key={application.id} className="rounded-md border border-zinc-200 p-4">
                    <div>
                      <h3 className="font-semibold text-zinc-950">{application.companyName}</h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {application.customerName ?? application.customerEmail ?? "Customer"}
                      </p>
                      {application.businessRegNo ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          Registration {application.businessRegNo}
                        </p>
                      ) : null}
                    </div>
                    <form action={approveWholesale} className="mt-4 grid gap-3">
                      <input type="hidden" name="accountId" value={application.id} />
                      <label className="grid gap-1 text-xs font-medium text-zinc-600">
                        Pricing tier
                        <select
                          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm text-zinc-800"
                          name="pricingTierId"
                          required
                        >
                          {pricingTiers.map((tier) => (
                            <option key={tier.id} value={tier.id}>
                              {tier.name} ({formatDiscount(tier.discountBps)} off, min{" "}
                              {formatMoney(tier.minOrderCents, tier.currency)})
                            </option>
                          ))}
                        </select>
                      </label>
                      {pricingTiers.length === 0 ? (
                        <p className="text-xs text-amber-700">
                          Create a wholesale pricing tier before approving accounts.
                        </p>
                      ) : null}
                      <button
                        className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                        disabled={pricingTiers.length === 0}
                      >
                        Approve with tier
                      </button>
                    </form>
                    <form action={rejectWholesale} className="mt-3 grid gap-2">
                      <input type="hidden" name="accountId" value={application.id} />
                      <input
                        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
                        maxLength={240}
                        name="reviewNote"
                        placeholder="Optional rejection note"
                      />
                      <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:border-rose-400">
                        Reject
                      </button>
                    </form>
                  </article>
                ))
              )}
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-5">
              <h3 className="text-sm font-semibold text-zinc-950">Assigned pricing tiers</h3>
              <div className="mt-3 grid gap-3">
                {approvedB2bTierAssignments.length === 0 ? (
                  <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                    No active wholesale tier assignments.
                  </p>
                ) : (
                  approvedB2bTierAssignments.slice(0, 8).map((assignment) => (
                    <article
                      key={`${assignment.customerId}:${assignment.tierId}`}
                      className="rounded-md border border-zinc-200 p-4"
                    >
                      <div>
                        <h4 className="font-semibold text-zinc-950">{assignment.companyName}</h4>
                        <p className="mt-1 text-sm text-zinc-500">
                          {assignment.customerName ?? assignment.customerEmail ?? "Customer"}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {assignment.tierName} ({formatDiscount(assignment.discountBps)} off, min{" "}
                          {formatMoney(assignment.minOrderCents, "SGD")})
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <form action={approveWholesale} className="grid gap-2">
                          <input type="hidden" name="accountId" value={assignment.accountId} />
                          <label className="grid gap-1 text-xs font-medium text-zinc-600">
                            Change tier
                            <select
                              className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm text-zinc-800"
                              defaultValue={assignment.tierId}
                              name="pricingTierId"
                              required
                            >
                              {pricingTiers.map((tier) => (
                                <option key={tier.id} value={tier.id}>
                                  {tier.name} ({formatDiscount(tier.discountBps)} off, min{" "}
                                  {formatMoney(tier.minOrderCents, tier.currency)})
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                            Save tier
                          </button>
                        </form>
                        <form action={removeWholesalePricingTier}>
                          <input type="hidden" name="customerId" value={assignment.customerId} />
                          <input type="hidden" name="pricingTierId" value={assignment.tierId} />
                          <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:border-rose-400">
                            Remove tier
                          </button>
                        </form>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Allocation controls</h2>
            <div className="mt-5 grid gap-3 text-sm leading-6 text-zinc-600">
              <p>
                Use the per-SKU Allocate buttons in the inventory table to run guarded allocation.
              </p>
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-900"
                href="/preorders"
              >
                Review customer preorder status
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function adminMetricsFrom({
  inventoryRows,
  exceptions,
  b2bApplications,
}: {
  inventoryRows: AdminInventoryRow[];
  exceptions: AdminOrderException[];
  b2bApplications: AdminB2bApplication[];
}) {
  const incoming = inventoryRows.reduce((sum, row) => sum + row.incoming, 0);
  const allocated = inventoryRows.reduce((sum, row) => sum + row.allocated, 0);
  return [
    {
      label: "Open exceptions",
      value: String(exceptions.length),
      detail: "Payment/order anomalies requiring review",
    },
    {
      label: "Pending B2B",
      value: String(b2bApplications.length),
      detail: "Wholesale applications awaiting staff approval",
    },
    {
      label: "Incoming boxes",
      value: String(incoming),
      detail: "Confirmed incoming stock across live SKUs",
    },
    {
      label: "Allocated boxes",
      value: String(allocated),
      detail: "Units reserved for orders and preorders",
    },
  ];
}

function exceptionTone(severity: AdminOrderException["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function formatExceptionType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ManualReconciliationForm({
  compact = false,
  defaultOrderId = "",
  defaultProviderPaymentId = "",
  defaultReason = "",
}: {
  compact?: boolean;
  defaultOrderId?: string;
  defaultProviderPaymentId?: string;
  defaultReason?: string;
}) {
  return (
    <form
      action={runAdminOrderAction}
      className={
        compact
          ? "grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3"
          : "mt-4 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
      }
    >
      <input type="hidden" name="action" value="record_manual_reconciliation" />
      <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Order ID
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={defaultOrderId}
            name="orderId"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Provider
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue="stripe"
            name="provider"
            required
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Payment reference
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          defaultValue={defaultProviderPaymentId}
          name="providerPaymentId"
          placeholder="pi_..."
          required
        />
      </label>
      <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Amount cents
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            min={1}
            name="amountCents"
            required
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Currency
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm uppercase"
            defaultValue="SGD"
            maxLength={3}
            minLength={3}
            name="currency"
            required
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Reason
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          defaultValue={defaultReason}
          maxLength={500}
          name="reason"
          required
        />
      </label>
      <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
        Record reconciliation
      </button>
    </form>
  );
}

function PurchaseOrderIntakeForm({
  suppliers,
  skus,
}: {
  suppliers: AdminSupplierOption[];
  skus: AdminInventoryRow[];
}) {
  const disabled = suppliers.length === 0 || skus.length === 0;

  return (
    <form
      action={recordSupplierPurchaseOrder}
      className="mt-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Supplier
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm text-zinc-800"
            disabled={disabled}
            name="supplierId"
            required
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          SKU
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm text-zinc-800"
            disabled={disabled}
            name="skuId"
            required
          >
            {skus.map((sku) => (
              <option key={sku.skuId} value={sku.skuId}>
                {sku.productName} - {sku.sku}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Quantity
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            disabled={disabled}
            min={1}
            name="quantity"
            required
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Unit cost cents
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            disabled={disabled}
            min={0}
            name="unitCostCents"
            required
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Currency
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm uppercase"
            defaultValue={suppliers[0]?.currency ?? "SGD"}
            disabled={disabled}
            maxLength={3}
            minLength={3}
            name="currency"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Expected
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            disabled={disabled}
            name="expectedAt"
            type="date"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Notes
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          disabled={disabled}
          maxLength={500}
          name="notes"
          placeholder="Distributor reference or approval note"
        />
      </label>
      {disabled ? (
        <p className="text-xs text-amber-700">
          Add at least one supplier and one SKU before recording incoming purchase orders.
        </p>
      ) : null}
      <button
        className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={disabled}
      >
        Record incoming PO
      </button>
    </form>
  );
}

function formatDiscount(discountBps: number) {
  const percent = discountBps / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

async function fetchInventoryRows(supabase = createServiceClient()): Promise<AdminInventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "sku_id, on_hand, incoming, allocated, safety_stock, available, booster_box_skus(sku, product_variants(products(name)))"
    )
    .eq("location", "main")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Admin inventory query failed: ${error.message}`);
  }

  return (
    (data ?? []) as unknown as Array<{
      sku_id: string;
      on_hand: number;
      incoming: number;
      allocated: number;
      safety_stock: number;
      available: number;
      booster_box_skus: {
        sku: string;
        product_variants: { products: { name: string } | null } | null;
      } | null;
    }>
  ).map((row) => ({
    skuId: row.sku_id,
    sku: row.booster_box_skus?.sku ?? row.sku_id,
    productName: row.booster_box_skus?.product_variants?.products?.name ?? "Unknown product",
    onHand: row.on_hand,
    incoming: row.incoming,
    allocated: row.allocated,
    safetyStock: row.safety_stock,
    available: row.available,
  }));
}

async function fetchPendingB2bApplications(
  supabase = createServiceClient()
): Promise<AdminB2bApplication[]> {
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("id, company_name, business_reg_no, created_at, customers(email, name)")
    .eq("review_status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`Wholesale application query failed: ${error.message}`);
  }

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      company_name: string;
      business_reg_no: string | null;
      created_at: string;
      customers: { email: string | null; name: string | null } | null;
    }>
  ).map((row) => ({
    id: row.id,
    companyName: row.company_name,
    businessRegNo: row.business_reg_no,
    customerName: row.customers?.name ?? null,
    customerEmail: row.customers?.email ?? null,
    createdAt: row.created_at,
  }));
}

async function fetchApprovedB2bTierAssignments(
  supabase = createServiceClient()
): Promise<AdminB2bTierAssignment[]> {
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select(
      "id, company_name, customers(id, email, name, customer_pricing_tiers(pricing_tier_id, pricing_tiers(id, code, name, discount_bps, min_order_cents)))"
    )
    .eq("approved", true)
    .eq("review_status", "approved")
    .order("approved_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Approved wholesale tier query failed: ${error.message}`);
  }

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      company_name: string;
      customers: {
        id: string;
        email: string | null;
        name: string | null;
        customer_pricing_tiers?: Array<{
          pricing_tier_id: string;
          pricing_tiers: {
            id: string;
            code: string;
            name: string;
            discount_bps: number;
            min_order_cents: number;
          } | null;
        }>;
      } | null;
    }>
  ).flatMap((account) =>
    (account.customers?.customer_pricing_tiers ?? [])
      .filter((assignment) => Boolean(assignment.pricing_tiers))
      .map((assignment) => ({
        accountId: account.id,
        customerId: account.customers?.id ?? "",
        companyName: account.company_name,
        customerEmail: account.customers?.email ?? null,
        customerName: account.customers?.name ?? null,
        tierId: assignment.pricing_tier_id,
        tierName: assignment.pricing_tiers?.name ?? "Unknown tier",
        tierCode: assignment.pricing_tiers?.code ?? "unknown",
        discountBps: assignment.pricing_tiers?.discount_bps ?? 0,
        minOrderCents: assignment.pricing_tiers?.min_order_cents ?? 0,
      }))
      .filter((assignment) => assignment.customerId)
  );
}

async function fetchPricingTiers(supabase = createServiceClient()): Promise<AdminPricingTier[]> {
  const { data, error } = await supabase
    .from("pricing_tiers")
    .select("id, code, name, discount_bps, min_order_cents")
    .gt("discount_bps", 0)
    .order("min_order_cents", { ascending: true });

  if (error) {
    throw new Error(`Pricing tier query failed: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      discount_bps: number;
      min_order_cents: number;
    }>
  ).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    discountBps: row.discount_bps,
    minOrderCents: row.min_order_cents,
    currency: "SGD",
  }));
}

async function fetchSupplierOptions(
  supabase = createServiceClient()
): Promise<AdminSupplierOption[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, currency")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Supplier option query failed: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      name: string;
      currency: string;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    currency: row.currency,
  }));
}

async function fetchPurchaseOrders(
  supabase = createServiceClient()
): Promise<AdminPurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, status, currency, expected_at, total_cents, suppliers(name), purchase_order_items(quantity)"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Purchase order query failed: ${error.message}`);
  }

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      status: string;
      currency: string;
      expected_at: string | null;
      total_cents: number;
      suppliers: { name: string } | null;
      purchase_order_items?: Array<{ quantity: number }>;
    }>
  ).map((row) => ({
    id: row.id,
    status: row.status,
    supplier: row.suppliers?.name ?? "Unknown supplier",
    expectedAt: row.expected_at,
    boxes: (row.purchase_order_items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    valueCents: row.total_cents,
    currency: row.currency,
  }));
}
