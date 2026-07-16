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
  setCatalogProductActive,
  setCatalogSkuActive,
  updateInventory,
  uploadCatalogProductImage,
  upsertCatalogProduct,
  upsertCatalogSku,
} from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listAdminOrderExceptions, type AdminOrderException } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

interface AdminInventoryRow {
  skuId: string;
  sku: string;
  skuActive: boolean;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  msrpCents: number | null;
  priceCents: number;
  currency: string;
  weightGrams: number | null;
  productId: string;
  productName: string;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
  available: number;
}

interface AdminCatalogProductRow {
  id: string;
  categoryId: string;
  setId: string | null;
  slug: string;
  name: string;
  productType: string;
  description: string | null;
  language: string;
  imageUrl: string | null;
  active: boolean;
}

interface AdminCategoryOption {
  id: string;
  name: string;
}

interface AdminSetOption {
  id: string;
  categoryId: string;
  name: string;
  code: string;
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
    catalogProducts,
    categoryOptions,
    setOptions,
    purchaseOrders,
    pricingTiers,
    suppliers,
  ] = await Promise.all([
    fetchInventoryRows(supabase),
    listAdminOrderExceptions(supabase),
    fetchPendingB2bApplications(supabase),
    fetchApprovedB2bTierAssignments(supabase),
    fetchCatalogProducts(supabase),
    fetchCategoryOptions(supabase),
    fetchSetOptions(supabase),
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

      <nav aria-label="Admin sections" className="flex flex-wrap gap-3">
        <Link className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700" href="/admin/listings">
          Storefront listings
        </Link>
        <Link className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700" href="/admin/deals">
          Limited-time deals
        </Link>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <CatalogManagementSection
        categories={categoryOptions}
        products={catalogProducts}
        sets={setOptions}
        skus={inventoryRows}
      />

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
                          <select
                            aria-label={`${row.sku} adjustment reason`}
                            className="h-10 rounded-md border border-zinc-300 px-2 text-xs"
                            name="reasonCode"
                            required
                          >
                            <option value="stock_count">Stock count</option>
                            <option value="supplier_update">Supplier update</option>
                            <option value="damage">Damage</option>
                            <option value="correction">Correction</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            className="h-10 w-36 rounded-md border border-zinc-300 px-2 text-xs"
                            aria-label={`${row.sku} adjustment note`}
                            maxLength={240}
                            name="reasonNote"
                            placeholder="Reason note"
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

function CatalogManagementSection({
  categories,
  products,
  sets,
  skus,
}: {
  categories: AdminCategoryOption[];
  products: AdminCatalogProductRow[];
  sets: AdminSetOption[];
  skus: AdminInventoryRow[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-950">Catalog management</h2>
        <StatusBadge tone="info">{products.length} products</StatusBadge>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <form action={upsertCatalogProduct} className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="font-semibold text-zinc-950">Create product</h3>
            <ProductFields categories={categories} sets={sets} />
            <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
              Create product
            </button>
          </form>

          <div className="grid gap-3">
            {products.slice(0, 8).map((product) => (
              <article key={product.id} className="rounded-md border border-zinc-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{product.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{product.slug}</p>
                  </div>
                  <StatusBadge tone={product.active ? "success" : "warning"}>
                    {product.active ? "active" : "archived"}
                  </StatusBadge>
                </div>
                <form action={upsertCatalogProduct} className="grid gap-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <ProductFields categories={categories} product={product} sets={sets} />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                    Save product
                  </button>
                </form>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <form action={uploadCatalogProductImage} className="grid gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      accept="image/*"
                      className="min-h-10 rounded-md border border-zinc-300 px-2 py-2 text-sm"
                      name="image"
                      required
                      type="file"
                    />
                    <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                      Upload image
                    </button>
                  </form>
                  <form action={setCatalogProductActive}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={product.active ? "false" : "true"}
                    />
                    <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:border-rose-400">
                      {product.active ? "Archive" : "Restore"}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <form action={upsertCatalogSku} className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="font-semibold text-zinc-950">Create SKU</h3>
            <SkuFields products={products} />
            <button
              className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={products.length === 0}
            >
              Create SKU
            </button>
          </form>

          <div className="grid gap-3">
            {skus.slice(0, 10).map((sku) => (
              <article key={sku.skuId} className="rounded-md border border-zinc-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{sku.sku}</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {sku.productName} - {formatMoney(sku.priceCents, sku.currency)}
                    </p>
                  </div>
                  <StatusBadge tone={sku.skuActive ? "success" : "warning"}>
                    {sku.skuActive ? "active" : "archived"}
                  </StatusBadge>
                </div>
                <form action={upsertCatalogSku} className="grid gap-3">
                  <input type="hidden" name="skuId" value={sku.skuId} />
                  <SkuFields products={products} sku={sku} />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                    Save SKU
                  </button>
                </form>
                <form action={setCatalogSkuActive} className="mt-3">
                  <input type="hidden" name="skuId" value={sku.skuId} />
                  <input type="hidden" name="active" value={sku.skuActive ? "false" : "true"} />
                  <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:border-rose-400">
                    {sku.skuActive ? "Archive SKU" : "Restore SKU"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductFields({
  categories,
  product,
  sets,
}: {
  categories: AdminCategoryOption[];
  product?: AdminCatalogProductRow;
  sets: AdminSetOption[];
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Name
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.name}
            maxLength={160}
            name="name"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Slug
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.slug}
            maxLength={180}
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Category
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.categoryId}
            name="categoryId"
            required
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Set
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.setId ?? ""}
            name="setId"
          >
            <option value="">None</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({set.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Type
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.productType ?? "booster_box"}
            maxLength={60}
            name="productType"
            required
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[8rem_1fr_auto]">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Language
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm uppercase"
            defaultValue={product?.language ?? "EN"}
            maxLength={8}
            name="language"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Image URL
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={product?.imageUrl ?? ""}
            maxLength={1000}
            name="imageUrl"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
          <input type="hidden" name="active" value="false" />
          <input defaultChecked={product?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Description
        <textarea
          className="min-h-20 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          defaultValue={product?.description ?? ""}
          maxLength={2000}
          name="description"
        />
      </label>
    </>
  );
}

function SkuFields({
  products,
  sku,
}: {
  products: AdminCatalogProductRow[];
  sku?: AdminInventoryRow;
}) {
  return (
    <>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Product
        <select
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          defaultValue={sku?.productId}
          name="productId"
          required
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          SKU
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm uppercase"
            defaultValue={sku?.sku}
            maxLength={120}
            name="sku"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Barcode
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.barcode ?? ""}
            maxLength={120}
            name="barcode"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Price cents
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.priceCents}
            min={0}
            name="priceCents"
            required
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          MSRP cents
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.msrpCents ?? ""}
            min={0}
            name="msrpCents"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Currency
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm uppercase"
            defaultValue={sku?.currency ?? "SGD"}
            maxLength={3}
            minLength={3}
            name="currency"
            required
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
          <input type="hidden" name="active" value="false" />
          <input defaultChecked={sku?.skuActive ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Packs/box
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.packsPerBox ?? ""}
            min={0}
            name="packsPerBox"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Cards/pack
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.cardsPerPack ?? ""}
            min={0}
            name="cardsPerPack"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Weight grams
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={sku?.weightGrams ?? ""}
            min={0}
            name="weightGrams"
            type="number"
          />
        </label>
      </div>
    </>
  );
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
      "sku_id, on_hand, incoming, allocated, safety_stock, available, booster_box_skus(sku, active, barcode, packs_per_box, cards_per_pack, msrp_cents, price_cents, currency, weight_grams, product_variants(products(id, name)))"
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
        active: boolean;
        barcode: string | null;
        packs_per_box: number | null;
        cards_per_pack: number | null;
        msrp_cents: number | null;
        price_cents: number;
        currency: string;
        weight_grams: number | null;
        product_variants: { products: { id: string; name: string } | null } | null;
      } | null;
    }>
  ).map((row) => ({
    skuId: row.sku_id,
    sku: row.booster_box_skus?.sku ?? row.sku_id,
    skuActive: row.booster_box_skus?.active ?? true,
    barcode: row.booster_box_skus?.barcode ?? null,
    packsPerBox: row.booster_box_skus?.packs_per_box ?? null,
    cardsPerPack: row.booster_box_skus?.cards_per_pack ?? null,
    msrpCents: row.booster_box_skus?.msrp_cents ?? null,
    priceCents: row.booster_box_skus?.price_cents ?? 0,
    currency: row.booster_box_skus?.currency ?? "SGD",
    weightGrams: row.booster_box_skus?.weight_grams ?? null,
    productId: row.booster_box_skus?.product_variants?.products?.id ?? "",
    productName: row.booster_box_skus?.product_variants?.products?.name ?? "Unknown product",
    onHand: row.on_hand,
    incoming: row.incoming,
    allocated: row.allocated,
    safetyStock: row.safety_stock,
    available: row.available,
  }));
}

async function fetchCatalogProducts(
  supabase = createServiceClient()
): Promise<AdminCatalogProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, category_id, set_id, slug, name, product_type, description, language, image_url, active")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Admin catalog product query failed: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      category_id: string;
      set_id: string | null;
      slug: string;
      name: string;
      product_type: string;
      description: string | null;
      language: string;
      image_url: string | null;
      active: boolean;
    }>
  ).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    setId: row.set_id,
    slug: row.slug,
    name: row.name,
    productType: row.product_type,
    description: row.description,
    language: row.language,
    imageUrl: row.image_url,
    active: row.active,
  }));
}

async function fetchCategoryOptions(
  supabase = createServiceClient()
): Promise<AdminCategoryOption[]> {
  const { data, error } = await supabase
    .from("tcg_categories")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Category option query failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{ id: string; name: string }>).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

async function fetchSetOptions(supabase = createServiceClient()): Promise<AdminSetOption[]> {
  const { data, error } = await supabase
    .from("sets_releases")
    .select("id, category_id, name, code")
    .order("release_date", { ascending: false });

  if (error) {
    throw new Error(`Set option query failed: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{ id: string; category_id: string; name: string; code: string }>
  ).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    code: row.code,
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
