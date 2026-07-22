import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { allocate, type AllocationRule, type PendingPreorder } from "@/lib/allocation";
import { badRequest, conflict } from "@/lib/api/errors";
import { hitPayRefundStatus, type HitPayClient } from "@/lib/hitpay";

export const preorderAllocationRequestSchema = z.object({
  productId: z.string().uuid(),
  fingerprint: z.string().trim().length(64),
});

export interface PreorderAllocationProductOption {
  productId: string;
  referenceCode: string;
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
  productId: string;
  referenceCode: string;
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

export async function listPreorderAllocationProducts(
  supabase: SupabaseClient
): Promise<PreorderAllocationProductOption[]> {
  const { data: preorders, error } = await supabase
    .from("preorders")
    .select("product_id")
    .eq("channel", "b2c")
    .eq("status", "paid");
  if (error) throw new Error(error.message);

  const countByProduct = new Map<string, number>();
  for (const row of preorders ?? []) {
    const productId = String(row.product_id);
    countByProduct.set(productId, (countByProduct.get(productId) ?? 0) + 1);
  }
  const productIds = [...countByProduct.keys()];
  if (productIds.length === 0) return [];

  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, reference_code, name")
    .in("id", productIds)
    .order("reference_code");
  if (productError) throw new Error(productError.message);

  return (products ?? []).map((row) => ({
      productId: String(row.id),
      referenceCode: String(row.reference_code ?? row.id),
      productName: String(row.name ?? "Unknown product"),
      preorderCount: countByProduct.get(String(row.id)) ?? 0,
    }));
}

export async function previewPreorderAllocationForProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<PreorderAllocationPreview> {
  const parsedProductId = z.string().uuid().parse(productId);
  const [inventory, rules, preorders, product] = await Promise.all([
    loadInventoryCapacity(supabase, parsedProductId),
    loadAllocationRules(supabase, parsedProductId),
    loadPaidPreorders(supabase, parsedProductId),
    loadProductLabel(supabase, parsedProductId),
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
        productId: parsedProductId,
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
    productId: parsedProductId,
    referenceCode: product.referenceCode,
    productName: product.productName,
    availableQty,
    requestedQty: rows.reduce((sum, row) => sum + row.requestedQty, 0),
    allocatedQty: rows.reduce((sum, row) => sum + row.allocatedQty, 0),
    refundCents: rows.reduce((sum, row) => sum + row.refundCents, 0),
    currency,
    fingerprint,
    rows,
  };
}

export async function executePreorderAllocationForProduct(
  supabase: SupabaseClient,
  hitpay: HitPayClient,
  input: { productId: string; fingerprint: string; actor: string }
): Promise<PreorderAllocationExecution> {
  const parsed = preorderAllocationRequestSchema.parse(input);
  let staged = await loadStagedAllocations(supabase, parsed.productId, parsed.fingerprint);

  if (staged.length === 0) {
    const preview = await previewPreorderAllocationForProduct(supabase, parsed.productId);
    if (preview.fingerprint !== parsed.fingerprint) {
      throw conflict(
        "The preorder queue or available stock changed. Review a fresh allocation preview."
      );
    }

    const { data, error } = await supabase.rpc("stage_preorder_allocations", {
      p_product_id: parsed.productId,
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
  productId: string
): Promise<InventoryCapacityRow> {
  const { data, error } = await supabase
    .from("product_inventory")
    .select("on_hand, incoming, allocated, safety_stock")
    .eq("product_id", productId)
    .eq("location", "main")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw badRequest("Inventory is not available for allocation");
  return data as InventoryCapacityRow;
}

async function loadAllocationRules(
  supabase: SupabaseClient,
  productId: string
): Promise<AllocationRule[]> {
  const { data, error } = await supabase
    .from("allocation_rules")
    .select("priority, reserve_quantity, max_per_customer")
    .eq("product_id", productId)
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

async function loadPaidPreorders(supabase: SupabaseClient, productId: string): Promise<PreorderRow[]> {
  const { data, error } = await supabase
    .from("preorders")
    .select(
      "id, customer_id, quantity, unit_price_cents, currency, created_at, customers(email, name)"
    )
    .eq("product_id", productId)
    .eq("channel", "b2c")
    .eq("status", "paid")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PreorderRow[];
}

async function loadProductLabel(
  supabase: SupabaseClient,
  productId: string
): Promise<{ referenceCode: string; productName: string }> {
  const { data, error } = await supabase
    .from("products")
    .select("reference_code, name")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw badRequest("Product not found");
  return {
    referenceCode: String(data.reference_code ?? productId),
    productName: String(data.name ?? "Unknown product"),
  };
}

async function loadStagedAllocations(
  supabase: SupabaseClient,
  productId: string,
  fingerprint: string
): Promise<StagedAllocationRow[]> {
  const { data: preorders, error } = await supabase
    .from("preorders")
    .select("id, allocated_qty, allocation_refund_cents, currency")
    .eq("product_id", productId)
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
