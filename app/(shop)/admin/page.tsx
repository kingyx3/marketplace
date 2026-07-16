import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  recordSupplierPurchaseOrder,
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

interface AdminPurchaseOrderRow {
  id: string;
  status: string;
  supplier: string;
  expectedAt: string | null;
  boxes: number;
  valueCents: number;
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
  const [inventory, exceptions, products, categories, sets, purchaseOrders, suppliers] =
    await Promise.all([
      fetchInventoryRows(supabase),
      listAdminOrderExceptions(supabase),
      fetchCatalogProducts(supabase),
      fetchCategoryOptions(supabase),
      fetchSetOptions(supabase),
      fetchPurchaseOrders(supabase),
      fetchSupplierOptions(supabase),
    ]);

  const activeProducts = products.filter((product) => product.active).length;
  const incoming = inventory.reduce((sum, row) => sum + row.incoming, 0);
  const allocated = inventory.reduce((sum, row) => sum + row.allocated, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Operations"
        description="Manage products, stock, purchasing, deals, and order exceptions."
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
      />

      <nav aria-label="Admin sections" className="flex flex-wrap gap-3">
        <AdminLink href="/admin/listings">Storefront listings</AdminLink>
        <AdminLink href="/admin/deals">Deals</AdminLink>
        <AdminLink href="/preorders">Preorders</AdminLink>
        <AdminLink href="/catalog">Open catalog</AdminLink>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Open exceptions"
          value={String(exceptions.length)}
          detail="Payment or order issues requiring review"
        />
        <MetricCard
          label="Active products"
          value={String(activeProducts)}
          detail={`${products.length} products configured`}
        />
        <MetricCard
          label="Incoming boxes"
          value={String(incoming)}
          detail="Expected stock across all SKUs"
        />
        <MetricCard
          label="Allocated boxes"
          value={String(allocated)}
          detail="Reserved for orders and preorders"
        />
      </section>

      <CatalogManagementSection
        categories={categories}
        products={products}
        sets={sets}
        skus={inventory}
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <InventorySection rows={inventory} />
          <PurchaseOrdersSection
            purchaseOrders={purchaseOrders}
            suppliers={suppliers}
            skus={inventory}
          />
        </div>
        <PaymentExceptionsSection exceptions={exceptions} />
      </section>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function InventorySection({ rows }: { rows: AdminInventoryRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-950">Inventory</h2>
        <StatusBadge tone="info">{rows.length} SKUs</StatusBadge>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No inventory rows are configured." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500">
              <tr>
                <th className="py-3 pr-4 font-medium">Product</th>
                <th className="py-3 pr-4 font-medium">On hand</th>
                <th className="py-3 pr-4 font-medium">Incoming</th>
                <th className="py-3 pr-4 font-medium">Safety</th>
                <th className="py-3 pr-4 font-medium">Available</th>
                <th className="py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.skuId}>
                  <td className="py-4 pr-4">
                    <p className="font-semibold text-zinc-950">{row.productName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{row.sku}</p>
                  </td>
                  <td colSpan={3} className="py-4 pr-4">
                    <form action={updateInventory} className="flex items-end gap-2">
                      <input type="hidden" name="skuId" value={row.skuId} />
                      <NumberField label="On hand" name="onHand" value={row.onHand} />
                      <NumberField label="Incoming" name="incoming" value={row.incoming} />
                      <NumberField label="Safety" name="safetyStock" value={row.safetyStock} />
                      <input type="hidden" name="reasonCode" value="stock_count" />
                      <input type="hidden" name="reasonNote" value="Admin inventory update" />
                      <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="py-4 pr-4">
                    <StatusBadge tone={row.available > 0 ? "success" : "warning"}>
                      {row.available}
                    </StatusBadge>
                  </td>
                  <td className="py-4">
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
      )}
    </section>
  );
}

function NumberField({ label, name, value }: { label: string; name: string; value: number }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        className="h-10 w-20 rounded-md border border-zinc-300 px-2"
        defaultValue={value}
        min={0}
        name={name}
        type="number"
      />
    </label>
  );
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
        <h2 className="text-xl font-semibold text-zinc-950">Catalog</h2>
        <StatusBadge tone="info">{products.length} products</StatusBadge>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <form
            action={upsertCatalogProduct}
            className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4"
          >
            <h3 className="font-semibold text-zinc-950">Add product</h3>
            <ProductFields categories={categories} sets={sets} />
            <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
              Create product
            </button>
          </form>
          {products.slice(0, 8).map((product) => (
            <article key={product.id} className="rounded-md border border-zinc-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-950">{product.name}</h3>
                  <p className="mt-1 text-xs text-zinc-500">/{product.slug}</p>
                </div>
                <StatusBadge tone={product.active ? "success" : "warning"}>
                  {product.active ? "Active" : "Archived"}
                </StatusBadge>
              </div>
              <form action={upsertCatalogProduct} className="grid gap-3">
                <input type="hidden" name="productId" value={product.id} />
                <ProductFields categories={categories} product={product} sets={sets} />
                <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600">
                  Save product
                </button>
              </form>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <form action={uploadCatalogProductImage} className="flex gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input
                    accept="image/*"
                    className="min-h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-2 text-xs"
                    name="image"
                    required
                    type="file"
                  />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800">
                    Upload
                  </button>
                </form>
                <form action={setCatalogProductActive}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="active" value={product.active ? "false" : "true"} />
                  <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">
                    {product.active ? "Archive" : "Restore"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <form
            action={upsertCatalogSku}
            className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4"
          >
            <h3 className="font-semibold text-zinc-950">Add SKU</h3>
            <SkuFields products={products} />
            <button
              className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-400"
              disabled={products.length === 0}
            >
              Create SKU
            </button>
          </form>
          {skus.slice(0, 10).map((sku) => (
            <article key={sku.skuId} className="rounded-md border border-zinc-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-950">{sku.sku}</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {sku.productName} · {formatMoney(sku.priceCents, sku.currency)}
                  </p>
                </div>
                <StatusBadge tone={sku.skuActive ? "success" : "warning"}>
                  {sku.skuActive ? "Active" : "Archived"}
                </StatusBadge>
              </div>
              <form action={upsertCatalogSku} className="grid gap-3">
                <input type="hidden" name="skuId" value={sku.skuId} />
                <SkuFields products={products} sku={sku} />
                <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600">
                  Save SKU
                </button>
              </form>
              <form action={setCatalogSkuActive} className="mt-3">
                <input type="hidden" name="skuId" value={sku.skuId} />
                <input type="hidden" name="active" value={sku.skuActive ? "false" : "true"} />
                <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">
                  {sku.skuActive ? "Archive SKU" : "Restore SKU"}
                </button>
              </form>
            </article>
          ))}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" value={product?.name} required />
        <TextField label="Slug" name="slug" value={product?.slug} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Category"
          name="categoryId"
          value={product?.categoryId}
          options={categories.map((item) => ({ value: item.id, label: item.name }))}
        />
        <SelectField
          label="Set"
          name="setId"
          value={product?.setId ?? ""}
          optional
          options={sets.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))}
        />
        <TextField
          label="Type"
          name="productType"
          value={product?.productType ?? "booster_box"}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_auto]">
        <TextField label="Language" name="language" value={product?.language ?? "EN"} required />
        <TextField label="Image URL" name="imageUrl" value={product?.imageUrl ?? ""} />
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

function SkuFields({ products, sku }: { products: AdminCatalogProductRow[]; sku?: AdminInventoryRow }) {
  return (
    <>
      <SelectField
        label="Product"
        name="productId"
        value={sku?.productId}
        options={products.map((item) => ({ value: item.id, label: item.name }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="SKU" name="sku" value={sku?.sku} required />
        <TextField label="Barcode" name="barcode" value={sku?.barcode ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <NumberInput label="Price cents" name="priceCents" value={sku?.priceCents} required />
        <NumberInput label="MSRP cents" name="msrpCents" value={sku?.msrpCents ?? undefined} />
        <TextField label="Currency" name="currency" value={sku?.currency ?? "SGD"} required />
        <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
          <input type="hidden" name="active" value="false" />
          <input defaultChecked={sku?.skuActive ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInput label="Packs per box" name="packsPerBox" value={sku?.packsPerBox ?? undefined} />
        <NumberInput label="Cards per pack" name="cardsPerPack" value={sku?.cardsPerPack ?? undefined} />
        <NumberInput label="Weight grams" name="weightGrams" value={sku?.weightGrams ?? undefined} />
      </div>
    </>
  );
}

function TextField({
  label,
  name,
  value,
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
        defaultValue={value}
        name={name}
        required={required}
      />
    </label>
  );
}

function NumberInput({
  label,
  name,
  value,
  required = false,
}: {
  label: string;
  name: string;
  value?: number;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
        defaultValue={value}
        min={0}
        name={name}
        required={required}
        type="number"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
  optional = false,
}: {
  label: string;
  name: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  optional?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <select
        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
        defaultValue={value}
        name={name}
        required={!optional}
      >
        {optional ? <option value="">None</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PurchaseOrdersSection({
  purchaseOrders,
  suppliers,
  skus,
}: {
  purchaseOrders: AdminPurchaseOrderRow[];
  suppliers: AdminSupplierOption[];
  skus: AdminInventoryRow[];
}) {
  const disabled = suppliers.length === 0 || skus.length === 0;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">Purchase orders</h2>
      <form
        action={recordSupplierPurchaseOrder}
        className="mt-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Supplier"
            name="supplierId"
            options={suppliers.map((item) => ({ value: item.id, label: item.name }))}
          />
          <SelectField
            label="SKU"
            name="skuId"
            options={skus.map((item) => ({ value: item.skuId, label: `${item.productName} · ${item.sku}` }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <NumberInput label="Quantity" name="quantity" required />
          <NumberInput label="Unit cost cents" name="unitCostCents" required />
          <TextField label="Currency" name="currency" value={suppliers[0]?.currency ?? "SGD"} required />
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            Expected
            <input className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm" name="expectedAt" type="date" />
          </label>
        </div>
        <TextField label="Notes" name="notes" />
        <button
          className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-400"
          disabled={disabled}
        >
          Record purchase order
        </button>
      </form>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {purchaseOrders.length === 0 ? (
          <EmptyState text="No purchase orders yet." />
        ) : (
          purchaseOrders.map((order) => (
            <article key={order.id} className="rounded-md border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-zinc-950">{order.id}</h3>
                <StatusBadge tone={order.status === "confirmed" ? "success" : "info"}>
                  {order.status}
                </StatusBadge>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <DataRow label="Supplier" value={order.supplier} />
                <DataRow label="Expected" value={order.expectedAt ?? "Unscheduled"} />
                <DataRow label="Boxes" value={String(order.boxes)} />
                <DataRow label="Value" value={formatMoney(order.valueCents, order.currency)} />
              </dl>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function PaymentExceptionsSection({ exceptions }: { exceptions: AdminOrderException[] }) {
  return (
    <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-28">
      <h2 className="text-lg font-semibold text-zinc-950">Payment exceptions</h2>
      <ManualReconciliationForm />
      <div className="mt-5 grid gap-3">
        {exceptions.length === 0 ? (
          <EmptyState text="No open payment exceptions." />
        ) : (
          exceptions.slice(0, 8).map((exception) => (
            <article key={exception.key} className="rounded-md border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-zinc-950">
                  {formatExceptionType(exception.exceptionType)}
                </h3>
                <StatusBadge tone={exceptionTone(exception.severity)}>{exception.severity}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{exception.detail}</p>
              {exception.orderId && exception.exceptionType === "failed_payment_allocation" ? (
                <form action={runAdminOrderAction} className="mt-3">
                  <input type="hidden" name="action" value="cancel_unpaid" />
                  <input type="hidden" name="orderId" value={exception.orderId} />
                  <input type="hidden" name="reason" value="Cancelled after failed payment" />
                  <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">
                    Cancel unpaid order
                  </button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

function ManualReconciliationForm() {
  return (
    <form
      action={runAdminOrderAction}
      className="mt-4 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
    >
      <input type="hidden" name="action" value="record_manual_reconciliation" />
      <TextField label="Order ID" name="orderId" required />
      <input type="hidden" name="provider" value="stripe" />
      <TextField label="Payment reference" name="providerPaymentId" required />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberInput label="Amount cents" name="amountCents" required />
        <TextField label="Currency" name="currency" value="SGD" required />
      </div>
      <TextField label="Reason" name="reason" required />
      <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
        Record reconciliation
      </button>
    </form>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
      {text}
    </p>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function formatExceptionType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function exceptionTone(severity: AdminOrderException["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

async function fetchInventoryRows(supabase = createServiceClient()): Promise<AdminInventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "sku_id, on_hand, incoming, allocated, safety_stock, available, booster_box_skus(sku, active, barcode, packs_per_box, cards_per_pack, msrp_cents, price_cents, currency, weight_grams, product_variants(products(id, name)))"
    )
    .eq("location", "main")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Admin inventory query failed: ${error.message}`);

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

  if (error) throw new Error(`Admin catalog product query failed: ${error.message}`);

  return ((data ?? []) as Array<{
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
  }>).map((row) => ({
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
  const { data, error } = await supabase.from("tcg_categories").select("id, name").order("name");
  if (error) throw new Error(`Category option query failed: ${error.message}`);
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
  if (error) throw new Error(`Set option query failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; category_id: string; name: string; code: string }>).map(
    (row) => ({ id: row.id, categoryId: row.category_id, name: row.name, code: row.code })
  );
}

async function fetchSupplierOptions(
  supabase = createServiceClient()
): Promise<AdminSupplierOption[]> {
  const { data, error } = await supabase.from("suppliers").select("id, name, currency").order("name");
  if (error) throw new Error(`Supplier option query failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; name: string; currency: string }>).map((row) => ({
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

  if (error) throw new Error(`Purchase order query failed: ${error.message}`);

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
