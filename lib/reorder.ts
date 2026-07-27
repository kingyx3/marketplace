import type { CartItem } from "@/lib/cart";
import { addCartItem } from "@/lib/cart";

const MAX_CART_LINES = 10;
const MAX_QUANTITY_PER_LINE = 24;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReorderSourceLine {
  product_id?: unknown;
  quantity?: unknown;
}

export interface ReorderQuoteLine {
  productId: string;
  quantity: number;
  available: number;
}

export type ReorderQuote = {
  lines: ReorderQuoteLine[];
};

export type ReorderQuoteFunction = (items: CartItem[]) => Promise<ReorderQuote>;

export type ReorderPreparation =
  | {
      ok: true;
      items: CartItem[];
      addedLines: number;
      addedQuantity: number;
    }
  | {
      ok: false;
      reason: "empty" | "invalid" | "cart_limit" | "unavailable";
    };

/**
 * Builds an all-or-nothing cart update from trusted order lines.
 *
 * The caller is responsible for loading an order owned by the authenticated
 * customer. Historical prices are intentionally ignored: the quote function
 * rechecks current products, currency, and sellable stock before any cookie is
 * written.
 */
export async function prepareReorderCart(
  currentItems: CartItem[],
  orderLines: ReorderSourceLine[],
  quoteCart: ReorderQuoteFunction,
): Promise<ReorderPreparation> {
  if (orderLines.length === 0) return { ok: false, reason: "empty" };

  const requested = new Map<string, number>();
  for (const line of orderLines) {
    const productId = typeof line.product_id === "string" ? line.product_id : "";
    const quantity = Number(line.quantity);
    if (!UUID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, reason: "invalid" };
    }

    const nextQuantity = (requested.get(productId) ?? 0) + quantity;
    if (nextQuantity > MAX_QUANTITY_PER_LINE) {
      return { ok: false, reason: "cart_limit" };
    }
    requested.set(productId, nextQuantity);
  }

  if (requested.size > MAX_CART_LINES) {
    return { ok: false, reason: "cart_limit" };
  }

  let candidate = currentItems;
  for (const [productId, quantity] of requested) {
    const before = candidate.find((item) => item.productId === productId)?.quantity ?? 0;
    if (before + quantity > MAX_QUANTITY_PER_LINE) {
      return { ok: false, reason: "cart_limit" };
    }

    const next = addCartItem(candidate, productId, quantity);
    const after = next.find((item) => item.productId === productId)?.quantity;
    if (after !== before + quantity || next.length > MAX_CART_LINES) {
      return { ok: false, reason: "cart_limit" };
    }
    candidate = next;
  }

  let quote: ReorderQuote;
  try {
    quote = await quoteCart(candidate);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const quotedByProduct = new Map(quote.lines.map((line) => [line.productId, line]));
  for (const productId of requested.keys()) {
    const candidateLine = candidate.find((item) => item.productId === productId);
    const quotedLine = quotedByProduct.get(productId);
    if (
      !candidateLine ||
      !quotedLine ||
      quotedLine.quantity !== candidateLine.quantity ||
      quotedLine.available < candidateLine.quantity
    ) {
      return { ok: false, reason: "unavailable" };
    }
  }

  return {
    ok: true,
    items: candidate,
    addedLines: requested.size,
    addedQuantity: [...requested.values()].reduce((sum, quantity) => sum + quantity, 0),
  };
}
