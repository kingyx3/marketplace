import { cookies } from "next/headers";

import { getProductQuote } from "@/lib/catalog";

const CART_COOKIE = "marketplace_cart";
const MAX_LINES = 10;
const MAX_QUANTITY_PER_LINE = 24;

export interface CartItem {
  productId: string;
  quantity: number;
}

export async function readCart(): Promise<CartItem[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CART_COOKIE)?.value;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeCart(parsed);
  } catch {
    return [];
  }
}

export async function writeCart(items: CartItem[]) {
  const cookieStore = await cookies();
  const normalized = normalizeCart(items);
  cookieStore.set(CART_COOKIE, Buffer.from(JSON.stringify(normalized)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearCart() {
  const cookieStore = await cookies();
  cookieStore.delete(CART_COOKIE);
}

export async function getCartQuote() {
  return getProductQuote(await readCart());
}

export function addCartItem(items: CartItem[], productId: string, quantity: number): CartItem[] {
  const current = normalizeCart(items);
  const existing = current.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + quantity);
  } else {
    current.push({ productId, quantity: clampQuantity(quantity) });
  }
  return normalizeCart(current);
}

export function updateCartItem(items: CartItem[], productId: string, quantity: number): CartItem[] {
  return normalizeCart(
    items
      .map((item) => (item.productId === productId ? { ...item, quantity: clampQuantity(quantity) } : item))
      .filter((item) => item.quantity > 0)
  );
}

export function removeCartItem(items: CartItem[], productId: string): CartItem[] {
  return normalizeCart(items.filter((item) => item.productId !== productId));
}

function normalizeCart(items: unknown[]): CartItem[] {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const productId = "productId" in item ? String(item.productId) : "";
    const quantity = "quantity" in item ? Number(item.quantity) : 0;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      continue;
    }
    byProduct.set(productId, clampQuantity((byProduct.get(productId) ?? 0) + quantity));
  }

  return [...byProduct.entries()]
    .slice(0, MAX_LINES)
    .map(([productId, quantity]) => ({ productId, quantity }))
    .filter((item) => item.quantity > 0);
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(MAX_QUANTITY_PER_LINE, Math.trunc(quantity)));
}
