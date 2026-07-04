import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import type { CustomerRecord } from "@/lib/api/auth";

export const MAX_CHECKOUT_LINES = 10;
export const MAX_QUANTITY_PER_LINE = 24;
export const MAX_CHECKOUT_TOTAL_QUANTITY = 24;
export const DEFAULT_PREORDER_DEPOSIT_BPS = 2000;

export type CheckoutMode = "order" | "preorder";
export type SalesChannel = "b2c" | "b2b";

export const cartItemSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const checkoutRequestSchema = z.object({
  mode: z.enum(["order", "preorder"]).default("order"),
  channel: z.enum(["b2c", "b2b"]).default("b2c"),
  items: z.array(cartItemSchema).min(1).max(MAX_CHECKOUT_LINES),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export interface CartItem {
  skuId: string;
  quantity: number;
}

export interface NormalizedCartItem extends CartItem {
  position: number;
}

export interface CheckoutRequest {
  mode: CheckoutMode;
  channel: SalesChannel;
  items: CartItem[];
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutLine {
  skuId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: string;
  availableToSell: number;
}

export interface CheckoutQuote {
  mode: CheckoutMode;
  channel: SalesChannel;
  currency: string;
  lines: CheckoutLine[];
  subtotalCents: number;
  discountBps: number;
  discountCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

interface SkuRecord {
  id: string;
  sku: string;
  price_cents: number;
  currency: string;
  product_variant_id: string;
}

interface InventoryRecord {
  on_hand: number;
  allocated: number;
  incoming: number;
  safety_stock: number;
  available?: number;
}

export function normalizeCartItems(items: CartItem[]): NormalizedCartItem[] {
  const bySku = new Map<string, NormalizedCartItem>();

  items.forEach((item, index) => {
    const existing = bySku.get(item.skuId);
    if (existing) {
      existing.quantity += item.quantity;
      if (existing.quantity > MAX_QUANTITY_PER_LINE) {
        throw badRequest(`Quantity for SKU ${item.skuId} exceeds ${MAX_QUANTITY_PER_LINE}`);
      }
      return;
    }

    bySku.set(item.skuId, {
      skuId: item.skuId,
      quantity: item.quantity,
      position: index,
    });
  });

  const normalized = [...bySku.values()].sort((a, b) => a.position - b.position);
  const totalQuantity = normalized.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > MAX_CHECKOUT_TOTAL_QUANTITY) {
    throw badRequest(`Cart quantity exceeds ${MAX_CHECKOUT_TOTAL_QUANTITY}`);
  }

  return normalized;
}

export function calculateDiscountCents(subtotalCents: number, discountBps: number): number {
  return Math.floor((subtotalCents * discountBps) / 10000);
}

export function calculateDepositCents(totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.max(100, Math.ceil((totalCents * DEFAULT_PREORDER_DEPOSIT_BPS) / 10000));
}

export async function quoteCheckout(
  supabase: SupabaseClient,
  request: CheckoutRequest,
  customer: CustomerRecord
): Promise<CheckoutQuote> {
  const items = normalizeCartItems(request.items);
  if (request.mode === "preorder" && items.length !== 1) {
    throw badRequest("Pre-order checkout currently supports one SKU per payment");
  }

  const channel = await resolveSalesChannel(supabase, customer.id, request.channel);
  const lines: CheckoutLine[] = [];
  let currency: string | null = null;
  let subtotalCents = 0;

  for (const item of items) {
    const line = await quoteLine(supabase, item, request.mode);
    if (currency && line.currency !== currency) {
      throw badRequest("Mixed-currency carts are not supported");
    }
    currency = line.currency;
    subtotalCents += line.lineTotalCents;
    lines.push(line);
  }

  const pricing = await findB2bPricing(supabase, customer.id, subtotalCents, channel);
  const discountBps = pricing.discountBps;
  const discountCents = calculateDiscountCents(subtotalCents, discountBps);
  const totalCents = subtotalCents - discountCents;
  const depositCents =
    request.mode === "preorder" ? calculateDepositCents(totalCents) : totalCents;

  return {
    mode: request.mode,
    channel,
    currency: currency ?? customer.default_currency,
    lines,
    subtotalCents,
    discountBps,
    discountCents,
    totalCents,
    depositCents,
    balanceCents: Math.max(0, totalCents - depositCents),
  };
}

async function resolveSalesChannel(
  supabase: SupabaseClient,
  customerId: string,
  requested: SalesChannel
): Promise<SalesChannel> {
  if (requested === "b2c") return "b2c";

  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("approved")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.approved) {
    throw forbidden("Approved B2B account required");
  }

  return "b2b";
}

async function quoteLine(
  supabase: SupabaseClient,
  item: NormalizedCartItem,
  mode: CheckoutMode
): Promise<CheckoutLine> {
  const { data: sku, error: skuError } = await supabase
    .from("booster_box_skus")
    .select("id, sku, price_cents, currency, product_variant_id")
    .eq("id", item.skuId)
    .single();
  if (skuError || !sku) {
    throw notFound("SKU not found");
  }

  const skuRecord = sku as SkuRecord;
  const productName = await productNameForSku(supabase, skuRecord.product_variant_id);
  const inventory = await inventoryForSku(supabase, skuRecord.id);
  const availableToSell = availableQuantity(inventory, mode);

  if (availableToSell < item.quantity) {
    throw badRequest("Requested quantity is not available");
  }

  return {
    skuId: skuRecord.id,
    sku: skuRecord.sku,
    productName,
    quantity: item.quantity,
    unitPriceCents: skuRecord.price_cents,
    lineTotalCents: skuRecord.price_cents * item.quantity,
    currency: skuRecord.currency,
    availableToSell,
  };
}

async function productNameForSku(supabase: SupabaseClient, variantId: string): Promise<string> {
  const variantResult = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .single();
  if (variantResult.error || !variantResult.data) {
    throw notFound("Product variant not found");
  }

  const productResult = await supabase
    .from("products")
    .select("name, active")
    .eq("id", variantResult.data.product_id)
    .single();
  if (productResult.error || !productResult.data) {
    throw notFound("Product not found");
  }
  if (!productResult.data.active) {
    throw badRequest("Product is not active");
  }

  return productResult.data.name;
}

async function inventoryForSku(supabase: SupabaseClient, skuId: string): Promise<InventoryRecord> {
  const { data, error } = await supabase
    .from("inventory")
    .select("on_hand, allocated, incoming, safety_stock, available")
    .eq("sku_id", skuId)
    .order("location", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw badRequest("Inventory is not available for this SKU");
  }

  return data as InventoryRecord;
}

function availableQuantity(inventory: InventoryRecord, mode: CheckoutMode): number {
  const physicalAvailable = inventory.available ?? inventory.on_hand - inventory.allocated;
  const stockBuffer = Math.max(0, inventory.safety_stock);

  if (mode === "preorder") {
    return Math.max(0, physicalAvailable + inventory.incoming - stockBuffer);
  }

  return Math.max(0, physicalAvailable - stockBuffer);
}

async function findB2bPricing(
  supabase: SupabaseClient,
  customerId: string,
  subtotalCents: number,
  channel: SalesChannel
): Promise<{ discountBps: number; minimumOrderCents: number }> {
  if (channel !== "b2b") return { discountBps: 0, minimumOrderCents: 0 };

  const assigned = await supabase
    .from("customer_pricing_tiers")
    .select("pricing_tier_id")
    .eq("customer_id", customerId);
  if (assigned.error) {
    throw new Error(assigned.error.message);
  }

  const tierIds = (assigned.data ?? [])
    .map((row: { pricing_tier_id?: string }) => row.pricing_tier_id)
    .filter((id): id is string => Boolean(id));
  if (tierIds.length === 0) {
    throw forbidden("B2B pricing tier assignment required");
  }

  const tiers = await supabase
    .from("pricing_tiers")
    .select("discount_bps, min_order_cents")
    .in("id", tierIds);
  if (tiers.error) {
    throw new Error(tiers.error.message);
  }

  const tierRows = tiers.data ?? [];
  if (tierRows.length === 0) {
    throw forbidden("B2B pricing tier assignment required");
  }

  const minimumOrderCents = tierRows.reduce((minimum: number, tier) => {
    const minOrder = Number(tier.min_order_cents ?? 0);
    return Math.min(minimum, minOrder);
  }, Number.POSITIVE_INFINITY);
  if (subtotalCents < minimumOrderCents) {
    throw badRequest(`B2B minimum order is ${minimumOrderCents} cents`);
  }

  const discountBps = tierRows.reduce((best: number, tier) => {
    const discount = Number(tier.discount_bps ?? 0);
    const minOrder = Number(tier.min_order_cents ?? 0);
    if (subtotalCents >= minOrder && discount > best) {
      return discount;
    }
    return best;
  }, 0);

  return { discountBps, minimumOrderCents };
}
