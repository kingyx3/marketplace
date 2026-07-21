"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCartItem, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";
import { getSkuQuote } from "@/lib/catalog";

export async function addToCart(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const quantity = quantityFrom(formData);
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/products"));
  const nextCart = addCartItem(await readCart(), skuId, quantity);

  if (!(await requestedQuantityIsAvailable(nextCart, skuId))) {
    redirect(withCartError(returnPath));
  }

  await writeCart(nextCart);
  revalidatePath("/cart");
  redirect("/cart");
}

export async function buyNow(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const quantity = quantityFrom(formData);
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/products"));
  const directItems = [{ skuId, quantity }];

  if (!(await requestedQuantityIsAvailable(directItems, skuId))) {
    redirect(withCartError(returnPath));
  }

  const query = new URLSearchParams({ sku: skuId, quantity: String(quantity) });
  redirect(`/buy-now?${query.toString()}#checkout`);
}

export async function updateCartQuantity(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);

  await writeCart(updateCartItem(await readCart(), skuId, quantity));
  revalidatePath("/cart");
}

export async function removeFromCart(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");

  await writeCart(removeCartItem(await readCart(), skuId));
  revalidatePath("/cart");
}

async function requestedQuantityIsAvailable(
  items: Array<{ skuId: string; quantity: number }>,
  skuId: string
): Promise<boolean> {
  try {
    const quote = await getSkuQuote(items);
    const line = quote.lines.find((item) => item.skuId === skuId);
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
