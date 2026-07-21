import type { SupabaseClient } from "@supabase/supabase-js";

import { toOne } from "@/lib/supabase-relations";

export interface ControlInventoryRow {
  skuId: string;
  sku: string;
  productId: string;
  productName: string;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
  available: number;
  updatedAt: string;
}

export interface ControlPurchaseOrderRow {
  id: string;
  status: string;
  supplier: string;
  expectedAt: string | null;
  orderedUnits: number;
  receivedUnits: number;
  valueCents: number;
  currency: string;
}

export interface ControlSupplierOption {
  id: string;
  name: string;
  currency: string;
}

export async function fetchControlInventory(
  supabase: SupabaseClient
): Promise<ControlInventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "sku_id, on_hand, incoming, allocated, safety_stock, available, updated_at, booster_box_skus(sku, product_variants(products(id, name)))"
    )
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) throw new Error(`Inventory query failed: ${error.message}`);
  return (
    (data ?? []) as unknown as Array<{
      sku_id: string;
      on_hand: number;
      incoming: number;
      allocated: number;
      safety_stock: number;
      available: number;
      updated_at: string;
      booster_box_skus:
        | {
            sku: string;
            product_variants: { products: { id: string; name: string } | null } | null;
          }
        | Array<{
            sku: string;
            product_variants: { products: { id: string; name: string } | null } | null;
          }>
        | null;
    }>
  ).map((row) => {
    const sku = toOne(row.booster_box_skus);
    return {
      skuId: row.sku_id,
      sku: sku?.sku ?? "Unknown SKU",
      productId: sku?.product_variants?.products?.id ?? "",
      productName: sku?.product_variants?.products?.name ?? "Unknown product",
      onHand: row.on_hand,
      incoming: row.incoming,
      allocated: row.allocated,
      safetyStock: row.safety_stock,
      available: row.available,
      updatedAt: row.updated_at,
    };
  });
}

export async function fetchControlPurchaseOrders(
  supabase: SupabaseClient
): Promise<ControlPurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, status, expected_at, total_cents, currency, suppliers(name), purchase_order_items(quantity, received_quantity)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Purchase order query failed: ${error.message}`);
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      status: string;
      expected_at: string | null;
      total_cents: number;
      currency: string;
      suppliers: { name: string } | Array<{ name: string }> | null;
      purchase_order_items: Array<{ quantity: number; received_quantity: number }> | null;
    }>
  ).map((row) => ({
    id: row.id,
    status: row.status,
    supplier: toOne(row.suppliers)?.name ?? "Unknown supplier",
    expectedAt: row.expected_at,
    orderedUnits: (row.purchase_order_items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    receivedUnits: (row.purchase_order_items ?? []).reduce(
      (sum, item) => sum + item.received_quantity,
      0
    ),
    valueCents: row.total_cents,
    currency: row.currency,
  }));
}

export async function fetchControlSupplierOptions(
  supabase: SupabaseClient
): Promise<ControlSupplierOption[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, currency")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Supplier options query failed: ${error.message}`);
  return (data ?? []) as ControlSupplierOption[];
}
