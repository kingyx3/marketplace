import Link from "next/link";

import {
  ProductIntakeForm,
  type CatalogCategoryOption,
  type CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
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
  setCatalogProductActive,
  setCatalogSkuActive,
  uploadCatalogProductImage,
  upsertCatalogProduct,
  upsertCatalogSku,
} from "@/app/actions/catalog";
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

interface ProductRow {
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
  published: boolean;
}

interface CategoryOption extends CatalogCategoryOption {
  active: boolean;
}

interface SetOption extends CatalogSetOption {
  active: boolean;
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
      fetchProducts(supabase),
      fetchCategories(supabase),
      fetchSets(supabase),
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
            ? "Create and maintain products, SKUs, stock, purchasing, allocation, and order exceptions."
            : "Create products and maintain their category, set, SKU, image, and publication relationships."
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
        <ControlLink href="/catalog">Open products</ControlLink>
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

      <CatalogSection categories={categories} products={products} sets={sets} skus={inventory} />

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

function CatalogSection({
  categories,
  products,
  sets,
  skus,
}: {
  categories: CategoryOption[];
  products: ProductRow[];
  sets: SetOption[];
  skus: InventoryRow[];
}) {
  const intakeCategories = categories.filter((category) => category.active);
  const intakeSets = sets.filter((set) => set.active);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Products and SKUs</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Select or create the category first, then select, create, or skip its set.
          </p>
        </div>
        <StatusBadge tone="info">{products.length} products</StatusBadge>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
        <h3 className="mb-5 font-semibold text-zinc-950">Create product</h3>
        <ProductIntakeForm categories={intakeCategories} sets={intakeSets} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <h3 className="font-semibold text-zinc-950">Existing products</h3>
          {products.length === 0 ? (
            <EmptyState text="No products have been created." />
          ) : (
            products.slice(0, 20).map((product) => (
              <article key={product.id} className="rounded-md border border-zinc-200 p-4">
                <RecordHeader
                  active={product.active}
                  detail={`/${product.slug}`}
                  title={product.name}
                />
                <form action={upsertCatalogProduct} className="grid gap-3">
                  <input name="productId" type="hidden" value={product.id} />
                  <ProductFields categories={categories} product={product} sets={sets} />
                  <SecondaryButton>Save product</SecondaryButton>
                </form>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <form action={uploadCatalogProductImage} className="flex gap-2">
                    <input name="productId" type="hidden" value={product.id} />
                    <input
                      accept="image/*"
                      className="min-h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-2 text-xs"
                      name="image"
                      required
                      type="file"
                    />
                    <SecondaryButton>Upload</SecondaryButton>
                  </form>
                  <ToggleForm
                    action={setCatalogProductActive}
                    active={product.active}
                    id={product.id}
                    idName="productId"
                    noun="product"
                  />
                </div>
              </article>
            ))
          )}
        </div>

        <div className="space-y-4">
          <form action={upsertCatalogSku} className={editorClass}>
            <h3 className="font-semibold text-zinc-950">Add SKU</h3>
            <SkuFields products={products} />
            <PrimaryButton disabled={products.length === 0}>Create SKU</PrimaryButton>
          </form>
          {skus.length === 0 ? (
            <EmptyState text="No SKUs have been created." />
          ) : (
            skus.slice(0, 20).map((sku) => (
              <article key={sku.skuId} className="rounded-md border border-zinc-200 p-4">
                <RecordHeader
                  active={sku.skuActive}
                  detail={`${sku.productName} · ${formatMoney(sku.priceCents, sku.currency)}`}
                  title={sku.sku}
                />
                <form action={upsertCatalogSku} className="grid gap-3">
                  <input name="skuId" type="hidden" value={sku.skuId} />
                  <SkuFields products={products} sku={sku} />
                  <SecondaryButton>Save SKU</SecondaryButton>
                </form>
                <div className="mt-3">
                  <ToggleForm
                    action={setCatalogSkuActive}
                    active={sku.skuActive}
                    id={sku.skuId}
                    idName="skuId"
                    noun="SKU"
                  />
                </div>
              </article>
            ))
          )}
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
  categories: CategoryOption[];
  product: ProductRow;
  sets: SetOption[];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" value={product.name} required />
        <TextField label="Slug" name="slug" value={product.slug} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Category"
          name="categoryId"
          options={categories.map((item) => ({ value: item.id, label: item.name }))}
          value={product.categoryId}
        />
        <SelectField
          label="Set"
          name="setId"
          optional
          options={sets.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))}
          value={product.setId ?? ""}
        />
        <TextField label="Type" name="productType" value={product.productType} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_auto]">
        <TextField label="Language" name="language" value={product.language} required />
        <TextField label="Image URL" name="imageUrl" value={product.imageUrl ?? ""} />
        <BooleanField label="Active" name="active" checked={product.active} />
      </div>
      <label className={labelClass}>
        Description
        <textarea
          className="min-h-20 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          defaultValue={product.description ?? ""}
          maxLength={2000}
          name="description"
        />
      </label>
    </>
  );
}

function SkuFields({ products, sku }: { products: ProductRow[]; sku?: InventoryRow }) {
  return (
    <>
      <SelectField
        label="Product"
        name="productId"
        options={products.map((item) => ({ value: item.id, label: item.name }))}
        value={sku?.productId}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="SKU" name="sku" value={sku?.sku} required />
        <TextField label="Barcode" name="barcode" value={sku?.barcode ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <NumberField label="Price cents" name="priceCents" value={sku?.priceCents} required />
        <NumberField label="MSRP cents" name="msrpCents" value={sku?.msrpCents ?? undefined} />
        <TextField label="Currency" name="currency" value={sku?.currency ?? "SGD"} required />
        <BooleanField label="Active" name="active" checked={sku?.skuActive ?? true} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Packs per box" name="packsPerBox" value={sku?.packsPerBox ?? undefined} />
        <NumberField label="Cards per pack" name="cardsPerPack" value={sku?.cardsPerPack ?? undefined} />
        <NumberField label="Weight grams" name="weightGrams" value={sku?.weightGrams ?? undefined} />
      </div>
    </>
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
                  <h3 className="font-semibold text-zinc-950">{row.productName}</h3>
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
          <NumberField label="Quantity" name="quantity" required />
          <NumberField label="Unit cost cents" name="unitCostCents" required />
          <TextField
            label="Currency"
            name="currency"
            value={suppliers[0]?.currency ?? "SGD"}
            required
          />
          <label className={labelClass}>
            Expected
            <input className={inputClass} name="expectedAt" type="date" />
          </label>
        </div>
        <TextField label="Notes" name="notes" />
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
        <NumberField label="Amount cents" name="amountCents" required />
        <TextField label="Currency" name="currency" value="SGD" required />
      </div>
      <TextField label="Reason" name="reason" required />
      <PrimaryButton>Record reconciliation</PrimaryButton>
    </form>
  );
}

function RecordHeader({ title, detail, active }: { title: string; detail: string; active: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-semibold text-zinc-950">{title}</h3>
        <p className="mt-1 text-xs text-zinc-500">{detail}</p>
      </div>
      <StatusBadge tone={active ? "success" : "warning"}>
        {active ? "Active" : "Archived"}
      </StatusBadge>
    </div>
  );
}

function ToggleForm({
  action,
  active,
  id,
  idName,
  noun,
}: {
  action: (formData: FormData) => Promise<void>;
  active: boolean;
  id: string;
  idName: string;
  noun: string;
}) {
  return (
    <form action={action}>
      <input name={idName} type="hidden" value={id} />
      <input name="active" type="hidden" value={active ? "false" : "true"} />
      <DangerButton>{active ? `Archive ${noun}` : `Restore ${noun}`}</DangerButton>
    </form>
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
    <label className={labelClass}>
      {label}
      <input className={inputClass} defaultValue={value} name={name} required={required} />
    </label>
  );
}

function NumberField({
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
    <label className={labelClass}>
      {label}
      <input
        className={inputClass}
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
    <label className={labelClass}>
      {label}
      <select className={inputClass} defaultValue={value} name={name} required={!optional}>
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

function BooleanField({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return (
    <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
      <input name={name} type="hidden" value="false" />
      <input defaultChecked={checked} name={name} type="checkbox" value="true" />
      {label}
    </label>
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

async function fetchProducts(supabase = createServiceClient()): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, category_id, set_id, slug, name, product_type, description, language, image_url, active, listing_items(published)"
    )
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(`Control product query failed: ${error.message}`);

  return (
    (data ?? []) as unknown as Array<{
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
      listing_items: Array<{ published: boolean }> | null;
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
    published: Boolean(row.listing_items?.[0]?.published),
  }));
}

async function fetchCategories(
  supabase = createServiceClient()
): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from("tcg_categories")
    .select("id, name, slug, active")
    .order("name");
  if (error) throw new Error(`Category option query failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; name: string; slug: string; active: boolean }>).map(
    (row) => ({ id: row.id, name: row.name, slug: row.slug, active: row.active })
  );
}

async function fetchSets(supabase = createServiceClient()): Promise<SetOption[]> {
  const { data, error } = await supabase
    .from("sets_releases")
    .select("id, category_id, name, code, active")
    .order("release_date", { ascending: false });
  if (error) throw new Error(`Set option query failed: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      category_id: string;
      name: string;
      code: string;
      active: boolean;
    }>
  ).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    code: row.code,
    active: row.active,
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

const labelClass = "grid gap-1 text-xs font-medium text-zinc-600";
const inputClass = "min-h-10 rounded-md border border-zinc-300 px-2 text-sm";
const editorClass = "grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4";
