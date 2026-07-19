import Link from "next/link";

import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  recordSupplierPurchaseOrder,
  runAdminOrderAction,
  runPreorderAllocation,
  updateInventory,
} from "@/app/actions/admin";
import {
  fetchControlCategories,
  fetchControlProducts,
  fetchControlSets,
  type ControlProductRow,
} from "@/lib/control-catalog";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { listAdminOrderExceptions, type AdminOrderException } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

interface InventoryRow {
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

interface PurchaseOrderRow {
  id: string;
  status: string;
  supplier: string;
  expectedAt: string | null;
  boxes: number;
  valueCents: number;
  currency: string;
}

interface SupplierOption {
  id: string;
  name: string;
  currency: string;
}

export const dynamic = "force-dynamic";

export default async function ControlOperationsPage() {
  const { staff } = await requireControlPermission("manage_catalog", "/control/operations");
  const canManageFullOperations = hasControlPermission(staff, "manage_full_operations");
  const supabase = createServiceClient();

  const [products, categories, sets, inventory, exceptions, purchaseOrders, suppliers] =
    await Promise.all([
      fetchControlProducts(supabase),
      fetchControlCategories(supabase),
      fetchControlSets(supabase),
      canManageFullOperations
        ? fetchInventoryRows(supabase)
        : Promise.resolve([] as InventoryRow[]),
      canManageFullOperations
        ? listAdminOrderExceptions(supabase)
        : Promise.resolve([] as AdminOrderException[]),
      canManageFullOperations
        ? fetchPurchaseOrders(supabase)
        : Promise.resolve([] as PurchaseOrderRow[]),
      canManageFullOperations
        ? fetchSuppliers(supabase)
        : Promise.resolve([] as SupplierOption[]),
    ]);

  const activeProducts = products.filter((product) => product.active).length;
  const activeCategories = categories.filter((category) => category.active).length;
  const activeSets = sets.filter((set) => set.active).length;
  const publishedProducts = products.filter((product) => product.published).length;
  const incoming = inventory.reduce((sum, row) => sum + row.incoming, 0);
  const allocated = inventory.reduce((sum, row) => sum + row.allocated, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description={
          canManageFullOperations
            ? "Review products, open a product to manage its SKUs, and operate stock, purchasing, allocation, and order exceptions."
            : "Review products and open a product to manage its details, image, publication relationships, and SKUs."
        }
        eyebrow="Control"
        title="Operations"
      />

      <nav aria-label="Operations links" className="flex flex-wrap gap-3">
        <ControlLink href="/control/listings">Storefront listings</ControlLink>
        <ControlLink href="/control/deals">Deals</ControlLink>
        <ControlLink href="/control/categories">Category details</ControlLink>
        <ControlLink href="/control/sets">Set details</ControlLink>
        {canManageFullOperations ? <ControlLink href="/preorders">Preorders</ControlLink> : null}
        <ControlLink href="/products">Open products</ControlLink>
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Products" value={String(products.length)} detail={`${activeProducts} active`} />
        <MetricCard
          label="Categories"
          value={String(categories.length)}
          detail={`${activeCategories} active`}
        />
        <MetricCard label="Sets" value={String(sets.length)} detail={`${activeSets} active`} />
        <MetricCard
          label="Published"
          value={String(publishedProducts)}
          detail="Visible storefront listings"
        />
      </section>

      <ProductListSection products={products} />

      {canManageFullOperations ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Open exceptions"
              value={String(exceptions.length)}
              detail="Payment or order issues requiring review"
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
        </>
      ) : null}
    </div>
  );
}

function ProductListSection({ products }: { products: ControlProductRow[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Products</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Open a product to view and edit its details and related SKUs.
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          href="/control/operations/products/new"
        >
          Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <EmptyState text="No products have been created." />
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200">
          {products.map((product) => (
            <Link
              className="group grid gap-3 bg-white p-4 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
              href={`/control/operations/products/${product.id}`}
              key={product.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-zinc-950 group-hover:text-emerald-700">
                    {product.name}
                  </h3>
                  <StatusBadge tone={product.active ? "success" : "warning"}>
                    {product.active ? "Active" : "Archived"}
                  </StatusBadge>
                  {product.published ? <StatusBadge tone="info">Published</StatusBadge> : null}
                  {product.skus.length === 0 ? <StatusBadge tone="warning">No SKU</StatusBadge> : null}
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">/{product.slug}</p>
                <p className="mt-2 text-sm text-zinc-600">
                  {[product.categoryName, product.setName, product.productType, product.language]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <span className="text-sm font-semibold text-zinc-700">
                  {product.skus.length} {product.skus.length === 1 ? "SKU" : "SKUs"}
                </span>
                <span aria-hidden="true" className="text-lg text-zinc-400 group-hover:text-emerald-700">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ControlLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function InventorySection({ rows }: { rows: InventoryRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-950">Inventory</h2>
        <StatusBadge tone="info">{rows.length} SKUs</StatusBadge>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No inventory rows are configured." />
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <article key={row.skuId} className="rounded-md border border-zinc-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    className="font-semibold text-zinc-950 hover:text-emerald-700"
                    href={`/control/operations/products/${row.productId}`}
                  >
                    {row.productName}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">{row.sku}</p>
                </div>
                <StatusBadge tone={row.available > 0 ? "success" : "warning"}>
                  {row.available} available
                </StatusBadge>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <form action={updateInventory} className="flex flex-wrap items-end gap-2">
                  <input name="skuId" type="hidden" value={row.skuId} />
                  <NumberField label="On hand" name="onHand" value={row.onHand} required />
                  <NumberField label="Incoming" name="incoming" value={row.incoming} required />
                  <NumberField label="Safety" name="safetyStock" value={row.safetyStock} required />
                  <input name="reasonCode" type="hidden" value="stock_count" />
                  <input name="reasonNote" type="hidden" value="Control inventory update" />
                  <PrimaryButton>Save stock</PrimaryButton>
                </form>
                <form action={runPreorderAllocation}>
                  <input name="skuId" type="hidden" value={row.skuId} />
                  <SecondaryButton>Allocate preorders</SecondaryButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PurchaseOrdersSection({
  purchaseOrders,
  suppliers,
  skus,
}: {
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierOption[];
  skus: InventoryRow[];
}) {
  const disabled = suppliers.length === 0 || skus.length === 0;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">Purchase orders</h2>
      <form action={recordSupplierPurchaseOrder} className={`mt-5 ${editorClass}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Supplier"
            name="supplierId"
            options={suppliers.map((item) => ({ value: item.id, label: item.name }))}
          />
          <SelectField
            label="SKU"
            name="skuId"
            options={skus.map((item) => ({
              value: item.skuId,
              label: `${item.productName} · ${item.sku}`,
            }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <NumberField label="Quantity" min={1} name="quantity" required />
          <NumberField label="Unit cost cents" name="unitCostCents" required />
          <TextField
            label="Currency"
            maxLength={3}
            minLength={3}
            name="currency"
            pattern="[A-Za-z]{3}"
            patternMessage="Currency must be a 3-letter code, such as SGD."
            value={suppliers[0]?.currency ?? "SGD"}
            required
          />
          <TextField label="Expected" name="expectedAt" type="date" />
        </div>
        <TextField label="Notes" maxLength={500} name="notes" />
        <PrimaryButton disabled={disabled}>Record purchase order</PrimaryButton>
      </form>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {purchaseOrders.length === 0 ? (
          <EmptyState text="No purchase orders yet." />
        ) : (
          purchaseOrders.map((order) => (
            <article key={order.id} className="rounded-md border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="break-all font-semibold text-zinc-950">{order.id}</h3>
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
                <StatusBadge tone={exceptionTone(exception.severity)}>
                  {exception.severity}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{exception.detail}</p>
              {exception.orderId && exception.exceptionType === "failed_payment_allocation" ? (
                <form action={runAdminOrderAction} className="mt-3">
                  <input name="action" type="hidden" value="cancel_unpaid" />
                  <input name="orderId" type="hidden" value={exception.orderId} />
                  <input name="reason" type="hidden" value="Cancelled after failed payment" />
                  <DangerButton>Cancel unpaid order</DangerButton>
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
    <form action={runAdminOrderAction} className={`mt-4 ${editorClass}`}>
      <input name="action" type="hidden" value="record_manual_reconciliation" />
      <TextField label="Order ID" name="orderId" required />
      <input name="provider" type="hidden" value="stripe" />
      <TextField label="Payment reference" name="providerPaymentId" required />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberField label="Amount cents" min={1} name="amountCents" required />
        <TextField
          label="Currency"
          maxLength={3}
          minLength={3}
          name="currency"
          pattern="[A-Za-z]{3}"
          patternMessage="Currency must be a 3-letter code, such as SGD."
          value="SGD"
          required
        />
      </div>
      <TextField label="Reason" maxLength={500} name="reason" required />
      <PrimaryButton>Record reconciliation</PrimaryButton>
    </form>
  );
}

function TextField({
  label,
  name,
  value,
  required = false,
  type = "text",
  pattern,
  patternMessage,
  maxLength,
  minLength,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
  pattern?: string;
  patternMessage?: string;
  maxLength?: number;
  minLength?: number;
}) {
  return (
    <AdminTextField
      defaultValue={value}
      example={textExample(name)}
      hint={textHint(name)}
      label={label}
      maxLength={maxLength}
      minLength={minLength}
      name={name}
      pattern={pattern}
      patternMessage={patternMessage}
      required={required}
      type={type}
    />
  );
}

function NumberField({
  label,
  name,
  value,
  required = false,
  min = 0,
}: {
  label: string;
  name: string;
  value?: number;
  required?: boolean;
  min?: number;
}) {
  return (
    <AdminNumberField
      defaultValue={value}
      example={numberExample(name)}
      label={label}
      min={min}
      name={name}
      required={required}
    />
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
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  optional?: boolean;
}) {
  return (
    <AdminSelectField
      defaultValue={value}
      example={options[0]?.label ?? "Select an option"}
      label={label}
      name={name}
      optionalLabel={optional ? "None" : undefined}
      options={options}
      required={!optional}
    />
  );
}

function PrimaryButton({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-400"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
      {children}
    </button>
  );
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">
      {children}
    </button>
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

function textExample(name: string) {
  const examples: Record<string, string> = {
    currency: "SGD",
    expectedAt: "2026-08-15",
    notes: "Initial supplier allocation for the August release.",
    orderId: "9c219c03-52ee-4f37-aec1-7e2fc241d56a",
    providerPaymentId: "pi_3Example123",
    reason: "Confirmed against the Stripe payment record.",
  };
  return examples[name] ?? "Enter a value";
}

function textHint(name: string) {
  const hints: Record<string, string> = {
    currency: "Use a three-letter ISO currency code.",
    notes: "Optional internal purchasing context.",
    orderId: "Use the marketplace order UUID.",
    providerPaymentId: "Use the exact Stripe payment identifier.",
  };
  return hints[name];
}

function numberExample(name: string) {
  const examples: Record<string, string> = {
    onHand: "24",
    incoming: "48",
    safetyStock: "2",
    quantity: "12",
    unitCostCents: "14500",
    amountCents: "18900",
  };
  return examples[name] ?? "0";
}

async function fetchInventoryRows(
  supabase = createServiceClient()
): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "sku_id, on_hand, incoming, allocated, safety_stock, available, booster_box_skus(sku, active, barcode, packs_per_box, cards_per_pack, msrp_cents, price_cents, currency, weight_grams, product_variants(products(id, name)))"
    )
    .eq("location", "main")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Control inventory query failed: ${error.message}`);

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

async function fetchSuppliers(
  supabase = createServiceClient()
): Promise<SupplierOption[]> {
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
): Promise<PurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, status, currency, expected_at, total_cents, suppliers(name), purchase_order_items(quantity)")
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

const editorClass = "grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4";
