import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { badRequest, notFound } from "@/lib/api/errors";
import type { CustomerRecord } from "@/lib/api/auth";
import { getActiveDealPrices } from "@/lib/deals";
import { quoteShipping, shippingAddressSchema } from "@/lib/shipping";

export const MAX_CHECKOUT_LINES = 10;
export const MAX_QUANTITY_PER_LINE = 24;
export const MAX_CHECKOUT_TOTAL_QUANTITY = 24;

export type CheckoutMode = "order" | "preorder";
export type SalesChannel = "b2c";

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
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
  productId: string;
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
  productId: string;
  referenceCode: string;
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

interface ProductRecord {
  id: string;
  reference_code: string | null;
  name: string;
  active: boolean;
  price_cents: number;
  currency: string;
}

interface InventoryRecord {
  on_hand: number;
  allocated: number;
  incoming: number;
  safety_stock: number;
  available?: number;
}

export function normalizeCartItems(items: CartItem[]): NormalizedCartItem[] {
  const byProduct = new Map<string, NormalizedCartItem>();

  items.forEach((item, index) => {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
      if (existing.quantity > MAX_QUANTITY_PER_LINE) {
        throw badRequest(`Quantity for product ${item.productId} exceeds ${MAX_QUANTITY_PER_LINE}`);
      }
      return;
    }

    byProduct.set(item.productId, {
      productId: item.productId,
      quantity: item.quantity,
      position: index,
    });
  });

  const normalized = [...byProduct.values()].sort((a, b) => a.position - b.position);
  const totalQuantity = normalized.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > MAX_CHECKOUT_TOTAL_QUANTITY) {
    throw badRequest(`Cart quantity exceeds ${MAX_CHECKOUT_TOTAL_QUANTITY}`);
  }

  return normalized;
}

export function calculateDiscountCents(subtotalCents: number, discountBps: number): number {
  return Math.floor((subtotalCents * discountBps) / 10000);
}

/**
 * Pre-orders use the same payment term as normal orders: the entire quoted
 * amount is paid at checkout. The legacy name remains as a compatibility
 * helper for callers and tests while returning the full amount.
 */
export function calculateDepositCents(totalCents: number): number {
  return Math.max(0, totalCents);
}

export async function quoteCheckout(
  supabase: SupabaseClient,
  request: CheckoutRequest,
  customer: CustomerRecord
): Promise<CheckoutQuote> {
  const items = normalizeCartItems(request.items);
  if (request.mode === "preorder" && items.length !== 1) {
    throw badRequest("Pre-order checkout currently supports one product per payment");
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
  const dealPrices =
    request.mode === "order"
      ? await getActiveDealPrices(
          supabase,
          lines.map((line) => line.productId)
        )
      : new Map<string, number>();
  const discountCents = lines.reduce((total, line) => {
    const dealPriceCents = dealPrices.get(line.productId);
    if (!dealPriceCents || dealPriceCents >= line.unitPriceCents) return total;
    return total + (line.unitPriceCents - dealPriceCents) * line.quantity;
  }, 0);
  const discountBps = subtotalCents > 0 ? Math.floor((discountCents * 10000) / subtotalCents) : 0;
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
    depositCents: totalCents,
    balanceCents: 0,
  };
}

async function quoteLine(
  supabase: SupabaseClient,
  item: NormalizedCartItem,
  mode: CheckoutMode
): Promise<CheckoutLine> {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, reference_code, name, active, price_cents, currency")
    .eq("id", item.productId)
    .single();
  if (productError || !product) throw notFound("Product not found");

  const productRecord = product as ProductRecord;
  if (!productRecord.active) throw badRequest("Product is not active");

  const inventory = await inventoryForProduct(supabase, productRecord.id);
  const availableToSell = availableQuantity(inventory, mode);

  if (availableToSell < item.quantity) {
    throw badRequest(
      mode === "order"
        ? "Requested quantity is unavailable or currently reserved by another checkout"
        : "Requested preorder quantity is not available"
    );
  }

  return {
    productId: productRecord.id,
    referenceCode: productRecord.reference_code ?? productRecord.id,
    productName: productRecord.name,
    quantity: item.quantity,
    unitPriceCents: productRecord.price_cents,
    lineTotalCents: productRecord.price_cents * item.quantity,
    currency: productRecord.currency,
    availableToSell,
  };
}

async function inventoryForProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<InventoryRecord> {
  const { data, error } = await supabase
    .from("product_inventory")
    .select("on_hand, allocated, incoming, safety_stock, available")
    .eq("product_id", productId)
    .order("location", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw badRequest("Inventory is not available for this product");
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
