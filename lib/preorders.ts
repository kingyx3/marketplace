import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { allocate, type AllocationRule, type PendingPreorder } from "@/lib/allocation";
import { badRequest, conflict } from "@/lib/api/errors";
import { hitPayRefundStatus, type HitPayClient } from "@/lib/hitpay";

export const preorderAllocationRequestSchema = z.object({
  skuId: z.string().uuid(),
  fingerprint: z.string().trim().length(64),
});

export interface PreorderAllocationSkuOption {
  skuId: string;
  sku: string;
  productName: string;
  preorderCount: number;
}

export interface PreorderAllocationPreviewRow {
  preorderId: string;
  customerId: string;
  customerLabel: string;
  requestedQty: number;
  allocatedQty: number;
  refundCents: number;
  unitPriceCents: number;
  currency: string;
  createdAt: string;
}

export interface PreorderAllocationPreview {
  skuId: string;
  sku: string;
  productName: string;
  availableQty: number;
  requestedQty: number;
  allocatedQty: number;
  refundCents: number;
  currency: string;
  fingerprint: string;
  rows: PreorderAllocationPreviewRow[];
}

export interface PreorderAllocationExecution {
  finalized: number;
  refundsCreated: number;
  refundCents: number;
}

interface InventoryCapacityRow {
  on_hand: number;
  incoming: number;
  allocated: number;
  safety_stock: number;
}

interface AllocationRuleRow {
  priority: number;
  reserve_quantity: number;
  max_per_customer: number | null;
}

interface PreorderRow {
  id: string;
  customer_id: string;
  quantity: number;
  unit_price_cents: number;
  currency: string;
  created_at: string;
  customers?: { email?: string | null; name?: string | null } | null;
}

interface StagedAllocationRow {
  preorder_id: string;
  allocated_qty: number;
  refund_cents: number;
  payment_id: string;
  provider_charge_id: string;
  currency: string;
}

export async function listPreorderAllocationSkus(
  supabase: SupabaseClient
): Promise<PreorderAllocationSkuOption[]> {
  const { data: preorders, error } = await supabase
    .from("preorders")
    .select("sku_id")
    .eq("channel", "b2c")
    .eq("status", "paid");
  if (error) throw new Error(error.message);

  const countBySku = new Map<string, number>();
  for (const row of preorders ?? []) {
    const skuId = String(row.sku_id);
    countBySku.set(skuId, (countBySku.get(skuId) ?? 0) + 1);
  }
  const skuIds = [...countBySku.keys()];
  if (skuIds.length === 0) return [];

  const { data: skus, error: skuError } = await supabase
    .from("booster_box_skus")
    .select("id, sku, product_variants(products(name))")
    .in("id", skuIds)
    .order("sku");
  if (skuError) throw new Error(skuError.message);

  return (skus ?? []).map((row) => {
    const variant = one(row.product_variants as unknown);
    const product = one(
      (variant as { products?: unknown } | null)?.products as unknown
    ) as { name?: string } | null;
    return {
      skuId: String(row.id),
      sku: String(row.sku),
      productName: product?.name ?? "Unknown product",
      preorderCount: countBySku.get(String(row.id)) ?? 0,
    };
  });
}

export async function previewPreorderAllocationForSku(
  supabase: SupabaseClient,
  skuId: string
): Promise<PreorderAllocationPreview> {
  const parsedSkuId = z.string().uuid().parse(skuId);
  const [inventory, rules, preorders, sku] = await Promise.all([
    loadInventoryCapacity(supabase, parsedSkuId),
    loadAllocationRules(supabase, parsedSkuId),
    loadPaidPreorders(supabase, parsedSkuId),
    loadSkuLabel(supabase, parsedSkuId),
  ]);

  if (preorders.length === 0) {
    throw badRequest("No fully paid preorders are awaiting allocation");
  }

  const availableQty = Math.max(
    0,
    inventory.on_hand + inventory.incoming - inventory.allocated - inventory.safety_stock
  );
  const pending: PendingPreorder[] = preorders.map((preorder, position) => ({
    preorderId: preorder.id,
    customerId: preorder.customer_id,
    channel: "b2c",
    quantity: preorder.quantity,
    position,
  }));
  const allocatedByPreorder = new Map(
    allocate(availableQty, rules, pending).map((allocation) => [
      allocation.preorderId,
      allocation.allocated,
    ])
  );

  const rows: PreorderAllocationPreviewRow[] = preorders.map((preorder) => {
    const allocatedQty = allocatedByPreorder.get(preorder.id) ?? 0;
    const customer = one(preorder.customers as unknown) as {
      email?: string | null;
      name?: string | null;
    } | null;
    return {
      preorderId: preorder.id,
      customerId: preorder.customer_id,
      customerLabel: customer?.name || customer?.email || preorder.customer_id,
      requestedQty: preorder.quantity,
      allocatedQty,
      refundCents: (preorder.quantity - allocatedQty) * preorder.unit_price_cents,
      unitPriceCents: preorder.unit_price_cents,
      currency: preorder.currency,
      createdAt: preorder.created_at,
    };
  });

  const currency = rows[0]?.currency ?? "SGD";
  if (rows.some((row) => row.currency !== currency)) {
    throw conflict("Allocation queue contains mixed currencies");
  }

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        skuId: parsedSkuId,
        availableQty,
        rows: rows.map((row) => ({
          preorderId: row.preorderId,
          requestedQty: row.requestedQty,
          allocatedQty: row.allocatedQty,
          unitPriceCents: row.unitPriceCents,
          createdAt: row.createdAt,
        })),
      })
    )
    .digest("hex");

  return {
    skuId: parsedSkuId,
    sku: sku.sku,
    productName: sku.productName,
    availableQty,
    requestedQty: rows.reduce((sum, row) => sum + row.requestedQty, 0),
    allocatedQty: rows.reduce((sum, row) => sum + row.allocatedQty, 0),
    refundCents: rows.reduce((sum, row) => sum + row.refundCents, 0),
    currency,
    fingerprint,
    rows,
  };
}

export async function executePreorderAllocationForSku(
  supabase: SupabaseClient,
  hitpay: HitPayClient,
  input: { skuId: string; fingerprint: string; actor: string }
): Promise<PreorderAllocationExecution> {
  const parsed = preorderAllocationRequestSchema.parse(input);
  let staged = await loadStagedAllocations(supabase, parsed.skuId, parsed.fingerprint);

  if (staged.length === 0) {
    const preview = await previewPreorderAllocationForSku(supabase, parsed.skuId);
    if (preview.fingerprint !== parsed.fingerprint) {
      throw conflict(
        "The preorder queue or available stock changed. Review a fresh allocation preview."
      );
    }

    const { data, error } = await supabase.rpc("stage_preorder_allocations", {
      p_sku_id: parsed.skuId,
      p_allocations: preview.rows.map((row) => ({
        preorder_id: row.preorderId,
        allocated: row.allocatedQty,
      })),
      p_fingerprint: parsed.fingerprint,
      p_actor: input.actor,
    });
    if (error) throw new Error(error.message);
    staged = (data ?? []) as StagedAllocationRow[];
  }

  if (staged.length === 0) {
    throw conflict("No preorder allocation remains to be confirmed");
  }

  let refundsCreated = 0;
  let refundCents = 0;
  let finalized = 0;

  for (const row of staged) {
    let refundId: string | null = null;
    let refundStatus: string | null = null;

    if (row.refund_cents > 0) {
      if (!row.provider_charge_id) {
        throw conflict(`HitPay charge is missing for preorder ${row.preorder_id}`);
      }
      const refund = await hitpay.createRefund({
        paymentId: row.provider_charge_id,
        amountCents: row.refund_cents,
      });
      const normalizedStatus = hitPayRefundStatus(refund.status);
      if (normalizedStatus === "failed") {
        throw conflict(`HitPay rejected the allocation refund for preorder ${row.preorder_id}`);
      }
      refundId = refund.id;
      refundStatus = normalizedStatus;
      refundsCreated += 1;
      refundCents += row.refund_cents;
    }

    const { error } = await supabase.rpc("finalize_preorder_allocation", {
      p_preorder_id: row.preorder_id,
      p_provider_refund_id: refundId,
      p_refund_status: refundStatus,
      p_actor: input.actor,
    });
    if (error) throw new Error(error.message);
    finalized += 1;
  }

  return { finalized, refundsCreated, refundCents };
}

async function loadInventoryCapacity(
  supabase: SupabaseClient,
  skuId: string
): Promise<InventoryCapacityRow> {
  const { data, error } = await supabase
    .from("inventory")
    .select("on_hand, incoming, allocated, safety_stock")
    .eq("sku_id", skuId)
    .eq("location", "main")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw badRequest("Inventory is not available for allocation");
  return data as InventoryCapacityRow;
}

async function loadAllocationRules(
  supabase: SupabaseClient,
  skuId: string
): Promise<AllocationRule[]> {
  const { data, error } = await supabase
    .from("allocation_rules")
    .select("priority, reserve_quantity, max_per_customer")
    .eq("sku_id", skuId)
    .eq("channel", "b2c")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AllocationRuleRow[];
  if (rows.length === 0) {
    return [{ priority: 10, channel: "b2c", reserveQuantity: 0, maxPerCustomer: null }];
  }
  return rows.map((row) => ({
    priority: row.priority,
    channel: "b2c",
    reserveQuantity: row.reserve_quantity,
    maxPerCustomer: row.max_per_customer,
  }));
}

async function loadPaidPreorders(
  supabase: SupabaseClient,
  skuId: string
): Promise<PreorderRow[]> {
  const { data, error } = await supabase
    .from("preorders")
    .select(
      "id, customer_id, quantity, unit_price_cents, currency, created_at, customers(email, name)"
    )
    .eq("sku_id", skuId)
    .eq("channel", "b2c")
    .eq("status", "paid")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PreorderRow[];
}

async function loadSkuLabel(
  supabase: SupabaseClient,
  skuId: string
): Promise<{ sku: string; productName: string }> {
  const { data, error } = await supabase
    .from("booster_box_skus")
    .select("sku, product_variants(products(name))")
    .eq("id", skuId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw badRequest("SKU not found");

  const variant = one(data.product_variants as unknown) as { products?: unknown } | null;
  const product = one(variant?.products as unknown) as { name?: string } | null;
  return { sku: String(data.sku), productName: product?.name ?? "Unknown product" };
}

async function loadStagedAllocations(
  supabase: SupabaseClient,
  skuId: string,
  fingerprint: string
): Promise<StagedAllocationRow[]> {
  const { data: preorders, error } = await supabase
    .from("preorders")
    .select("id, allocated_qty, allocation_refund_cents, currency")
    .eq("sku_id", skuId)
    .eq("allocation_fingerprint", fingerprint)
    .in("status", ["allocated", "refund_pending"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!preorders?.length) return [];

  const ids = preorders.map((preorder) => String(preorder.id));
  const { data: payments, error: paymentError } = await supabase
    .from("payments")
    .select("id, preorder_id, provider_charge_id")
    .in("preorder_id", ids)
    .eq("provider", "hitpay")
    .eq("kind", "full")
    .eq("status", "captured");
  if (paymentError) throw new Error(paymentError.message);
  const paymentByPreorder = new Map(
    (payments ?? []).map((payment) => [String(payment.preorder_id), payment])
  );

  return preorders.map((preorder) => {
    const payment = paymentByPreorder.get(String(preorder.id));
    if (!payment) {
      throw conflict(`Captured HitPay payment is missing for preorder ${preorder.id}`);
    }
    if (!payment.provider_charge_id) {
      throw conflict(`HitPay charge is missing for preorder ${preorder.id}`);
    }
    return {
      preorder_id: String(preorder.id),
      allocated_qty: Number(preorder.allocated_qty),
      refund_cents: Number(preorder.allocation_refund_cents),
      payment_id: String(payment.id),
      provider_charge_id: String(payment.provider_charge_id),
      currency: String(preorder.currency),
    };
  });
}

function one<T = unknown>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
