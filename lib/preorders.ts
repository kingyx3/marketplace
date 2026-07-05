import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { allocate, type AllocationRule, type PendingPreorder } from "@/lib/allocation";
import { badRequest } from "@/lib/api/errors";

export const preorderAllocationRequestSchema = z.object({
  skuId: z.string().uuid(),
});

export interface AppliedPreorderAllocation {
  preorder_id: string;
  allocated_qty: number;
  balance_cents: number;
  status: string;
}

interface InventoryCapacityRow {
  on_hand: number;
  incoming: number;
  allocated: number;
  safety_stock: number;
}

interface AllocationRuleRow {
  priority: number;
  channel: "b2c" | "b2b";
  reserve_quantity: number;
  max_per_customer: number | null;
}

interface PreorderAllocationRow {
  id: string;
  customer_id: string;
  channel: "b2c" | "b2b";
  quantity: number;
  allocated_qty: number;
  created_at: string;
}

export async function runPreorderAllocationForSku(
  supabase: SupabaseClient,
  skuId: string,
  actor: string
): Promise<AppliedPreorderAllocation[]> {
  const input = preorderAllocationRequestSchema.parse({ skuId });
  const [inventory, rules, preorders] = await Promise.all([
    loadInventoryCapacity(supabase, input.skuId),
    loadAllocationRules(supabase, input.skuId),
    loadPendingPreorders(supabase, input.skuId),
  ]);

  const available = Math.max(
    0,
    inventory.on_hand + inventory.incoming - inventory.allocated - inventory.safety_stock
  );
  if (available <= 0 || preorders.length === 0) {
    return [];
  }

  const pending: PendingPreorder[] = preorders
    .map((preorder, index) => ({
      preorderId: preorder.id,
      customerId: preorder.customer_id,
      channel: preorder.channel,
      quantity: Math.max(0, preorder.quantity - preorder.allocated_qty),
      position: index,
    }))
    .filter((preorder) => preorder.quantity > 0);

  const allocations = allocate(available, rules, pending);
  if (allocations.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc("apply_preorder_allocations", {
    p_sku_id: input.skuId,
    p_allocations: allocations.map((allocation) => ({
      preorder_id: allocation.preorderId,
      allocated: allocation.allocated,
    })),
    p_actor: actor,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AppliedPreorderAllocation[];
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

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw badRequest("Inventory is not available for allocation");
  }
  return data as InventoryCapacityRow;
}

async function loadAllocationRules(
  supabase: SupabaseClient,
  skuId: string
): Promise<AllocationRule[]> {
  const { data, error } = await supabase
    .from("allocation_rules")
    .select("priority, channel, reserve_quantity, max_per_customer")
    .eq("sku_id", skuId)
    .eq("active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AllocationRuleRow[];
  if (rows.length === 0) {
    return [
      { priority: 10, channel: "b2c", reserveQuantity: 0, maxPerCustomer: null },
      { priority: 20, channel: "b2b", reserveQuantity: 0, maxPerCustomer: null },
    ];
  }

  return rows.map((row) => ({
    priority: row.priority,
    channel: row.channel,
    reserveQuantity: row.reserve_quantity,
    maxPerCustomer: row.max_per_customer,
  }));
}

async function loadPendingPreorders(
  supabase: SupabaseClient,
  skuId: string
): Promise<PreorderAllocationRow[]> {
  const { data, error } = await supabase
    .from("preorders")
    .select("id, customer_id, channel, quantity, allocated_qty, created_at")
    .eq("sku_id", skuId)
    .in("status", ["deposited", "allocated", "balance_due"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PreorderAllocationRow[];
}
