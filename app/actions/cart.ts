"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCartItem, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";
import { getProductQuote } from "@/lib/catalog";

export async function addToCart(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = quantityFrom(formData);
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/products"));
  const nextCart = addCartItem(await readCart(), productId, quantity);

  let requestedQuantityAvailable = false;
  try {
    const quote = await getProductQuote(nextCart);
    const line = quote.lines.find((item) => item.productId === productId);
    requestedQuantityAvailable = Boolean(line && line.available >= line.quantity);
  } catch {
    requestedQuantityAvailable = false;
  }

  if (!requestedQuantityAvailable) {
    redirect(withCartError(returnPath));
  }

  await writeCart(nextCart);
  revalidatePath("/cart");
  redirect("/cart");
}

export async function buyNow(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = quantityFrom(formData);
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/products"));
  const directItems = [{ productId, quantity }];

  if (!(await requestedQuantityIsAvailable(directItems, productId))) {
    redirect(withCartError(returnPath));
  }

  const query = new URLSearchParams({ product: productId, quantity: String(quantity) });
  redirect(`/buy-now?${query.toString()}#checkout`);
}

export async function updateCartQuantity(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);

  await writeCart(updateCartItem(await readCart(), productId, quantity));
  revalidatePath("/cart");
}

export async function removeFromCart(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");

  await writeCart(removeCartItem(await readCart(), productId));
  revalidatePath("/cart");
}

async function requestedQuantityIsAvailable(
  items: Array<{ productId: string; quantity: number }>,
  productId: string
): Promise<boolean> {
  try {
    const quote = await getProductQuote(items);
    const line = quote.lines.find((item) => item.productId === productId);
    return Boolean(line && line.available >= line.quantity);
  } catch {
    return false;
  }
}

function quantityFrom(formData: FormData): number {
  const quantity = Number(formData.get("quantity") ?? 1);
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(24, Math.trunc(quantity)));
}

function safeReturnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/products";
}

function withCartError(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}cart=unavailable`;
}
