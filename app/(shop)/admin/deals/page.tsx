import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setLimitedTimeDealActive, upsertLimitedTimeDeal } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface DealRow {
  id: string;
  code: string;
  sku_id: string;
  title: string;
  description: string | null;
  discount_bps: number;
  visibility: "public" | "members";
  starts_at: string;
  ends_at: string;
  sort_priority: number;
  active: boolean;
}

interface SkuRow {
  id: string;
  sku: string;
  active: boolean;
  product_variants: {
    products: { name: string; active: boolean } | null;
  } | null;
}

export default async function AdminDealsPage() {
  const { staff } = await requireStaff("/admin/deals");
  const supabase = createServiceClient();
  const [{ data: dealData, error: dealsError }, { data: skuData, error: skusError }] =
    await Promise.all([
      supabase
        .from("limited_time_deals")
        .select(
          "id, code, sku_id, title, description, discount_bps, visibility, starts_at, ends_at, sort_priority, active"
        )
        .order("starts_at", { ascending: false }),
      supabase
        .from("booster_box_skus")
        .select("id, sku, active, product_variants!inner(products!inner(name, active))")
        .order("sku", { ascending: true }),
    ]);

  if (dealsError) throw new Error(`Limited-time deal lookup failed: ${dealsError.message}`);
  if (skusError) throw new Error(`SKU lookup failed: ${skusError.message}`);

  const deals = (dealData ?? []) as DealRow[];
  const skus = (skuData ?? []) as unknown as SkuRow[];

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">Staff verified: {staff.role}</StatusBadge>}
        description="Create truthful, time-bounded promotions. Public deals can be previewed without an account; member deals are disclosed only after sign-in."
        eyebrow="Admin"
        title="Limited-time deals"
      />

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-emerald-700 hover:text-emerald-900" href="/admin">
          Back to admin
        </Link>
        <Link className="text-emerald-700 hover:text-emerald-900" href="/deals">
          View storefront deals
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Create deal</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Times below are Singapore time (SGT). Checkout revalidates the active window and discount.
        </p>
        <DealForm skus={skus} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {deals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
            No limited-time deals have been configured.
          </p>
        ) : (
          deals.map((deal) => {
            return (
              <article
                key={deal.id}
                className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-zinc-950">{deal.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{deal.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={deal.visibility === "public" ? "success" : "neutral"}>
                      {deal.visibility}
                    </StatusBadge>
                    <StatusBadge tone={deal.active ? "success" : "warning"}>
                      {deal.active ? "active schedule" : "inactive"}
                    </StatusBadge>
                  </div>
                </div>
                <DealForm deal={deal} skus={skus} />
                <form action={setLimitedTimeDealActive} className="mt-3">
                  <input name="dealId" type="hidden" value={deal.id} />
                  <input name="active" type="hidden" value={deal.active ? "false" : "true"} />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-4 text-xs font-semibold text-zinc-800 hover:border-emerald-600">
                    {deal.active ? "Deactivate deal" : "Activate deal"}
                  </button>
                </form>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function DealForm({ deal, skus }: { deal?: DealRow; skus: SkuRow[] }) {
  return (
    <form action={upsertLimitedTimeDeal} className="mt-5 grid gap-3">
      {deal ? <input name="dealId" type="hidden" value={deal.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Code">
          <input
            className={inputClass}
            defaultValue={deal?.code ?? ""}
            maxLength={80}
            name="code"
            required
          />
        </Field>
        <Field label="SKU">
          <select className={inputClass} defaultValue={deal?.sku_id ?? ""} name="skuId" required>
            <option disabled value="">
              Select a SKU
            </option>
            {skus.map((sku) => (
              <option
                disabled={!sku.active || !sku.product_variants?.products?.active}
                key={sku.id}
                value={sku.id}
              >
                {sku.product_variants?.products?.name ?? "Unknown product"} — {sku.sku}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Customer-facing title">
        <input
          className={inputClass}
          defaultValue={deal?.title ?? ""}
          maxLength={160}
          name="title"
          required
        />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputClass} min-h-20 py-2`}
          defaultValue={deal?.description ?? ""}
          maxLength={500}
          name="description"
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Discount (basis points)">
          <input
            className={inputClass}
            defaultValue={deal?.discount_bps ?? 500}
            max={9000}
            min={1}
            name="discountBps"
            required
            type="number"
          />
        </Field>
        <Field label="Audience">
          <select
            className={inputClass}
            defaultValue={deal?.visibility ?? "members"}
            name="visibility"
          >
            <option value="members">Signed-in members</option>
            <option value="public">Public preview</option>
          </select>
        </Field>
        <Field label="Sort priority">
          <input
            className={inputClass}
            defaultValue={deal?.sort_priority ?? 0}
            name="sortPriority"
            type="number"
          />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Starts (SGT)">
          <input
            className={inputClass}
            defaultValue={deal ? singaporeDateTimeInput(deal.starts_at) : ""}
            name="startsAt"
            required
            type="datetime-local"
          />
        </Field>
        <Field label="Ends (SGT)">
          <input
            className={inputClass}
            defaultValue={deal ? singaporeDateTimeInput(deal.ends_at) : ""}
            name="endsAt"
            required
            type="datetime-local"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
        <input name="active" type="hidden" value="false" />
        <input
          defaultChecked={deal?.active ?? true}
          name="active"
          type="checkbox"
          value="true"
        />
        Active (the scheduled window still controls storefront eligibility)
      </label>
      <button className="min-h-10 rounded-md bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-emerald-700">
        {deal ? "Save deal" : "Create deal"}
      </button>
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      {children}
    </label>
  );
}

function singaporeDateTimeInput(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoDate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

const inputClass = "min-h-10 rounded-md border border-zinc-300 px-3 text-sm";
