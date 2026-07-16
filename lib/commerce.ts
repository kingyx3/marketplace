import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { badRequest, notFound } from "@/lib/api/errors";
import type { CustomerRecord } from "@/lib/api/auth";
import { calculateDealSavings, getActiveDealDiscounts } from "@/lib/deals";
import { quoteShipping, shippingAddressSchema } from "@/lib/shipping";

export const MAX_CHECKOUT_LINES = 10;
export const MAX_QUANTITY_PER_LINE = 24;
export const MAX_CHECKOUT_TOTAL_QUANTITY = 24;
export const DEFAULT_PREORDER_DEPOSIT_BPS = 2000;

export type CheckoutMode = "order" | "preorder";
export type SalesChannel = "b2c";

export const cartItemSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const checkoutRequestSchema = z.object({
  mode: z.enum(["order", "preorder"]).default("order"),
  channel: z.literal("b2c").default("b2c"),
  items: z.array(cartItemSchema).min(1).max(MAX_CHECKOUT_LINES),
  shippingAddress: shippingAddressSchema.optional(),
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
  shippingAddress?: z.infer<typeof shippingAddressSchema>;
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
  shippingCents?: number;
  shippingService?: string | null;
  shippingPolicyKey?: string | null;
  taxCents?: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
}

interface SkuRecord {
  id: string;
  sku: string;
  active: boolean;
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

  const resolvedCurrency = currency ?? customer.default_currency;
  const dealDiscounts =
    request.mode === "order"
      ? await getActiveDealDiscounts(
          supabase,
          lines.map((line) => line.skuId)
        )
      : new Map<string, number>();
  const discountCents = lines.reduce((total, line) => {
    return total + calculateDealSavings(line.lineTotalCents, dealDiscounts.get(line.skuId) ?? 0);
  }, 0);
  const discountBps =
    subtotalCents > 0 ? Math.floor((discountCents * 10000) / subtotalCents) : 0;
  const merchandiseTotalCents = subtotalCents - discountCents;
  const shipping =
    request.mode === "order"
      ? await quoteShipping(
          supabase,
          request.shippingAddress,
          merchandiseTotalCents,
          resolvedCurrency
        )
      : null;
  const shippingCents = shipping?.shippingCents ?? 0;
  const totalCents = merchandiseTotalCents + shippingCents;
  const depositCents =
    request.mode === "preorder" ? calculateDepositCents(totalCents) : totalCents;

  return {
    mode: request.mode,
    channel: "b2c",
    currency: resolvedCurrency,
    lines,
    subtotalCents,
    discountBps,
    discountCents,
    shippingCents,
    shippingService: shipping?.serviceName ?? null,
    shippingPolicyKey: shipping?.policyKey ?? null,
    taxCents: Math.round((totalCents * 9) / 109),
    totalCents,
    depositCents,
    balanceCents: Math.max(0, totalCents - depositCents),
  };
}

async function quoteLine(
  supabase: SupabaseClient,
  item: NormalizedCartItem,
  mode: CheckoutMode
): Promise<CheckoutLine> {
  const { data: sku, error: skuError } = await supabase
    .from("booster_box_skus")
    .select("id, sku, active, price_cents, currency, product_variant_id")
    .eq("id", item.skuId)
    .single();
  if (skuError || !sku) {
    throw notFound("SKU not found");
  }

  const skuRecord = sku as SkuRecord;
  if (!skuRecord.active) {
    throw badRequest("SKU is not active");
  }

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
