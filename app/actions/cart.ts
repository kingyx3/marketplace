"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCartItem, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";
import { getSkuQuote } from "@/lib/catalog";

export async function addToCart(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "/products"));
  const nextCart = addCartItem(await readCart(), skuId, quantity);

  let requestedQuantityAvailable = false;
  try {
    const quote = await getSkuQuote(nextCart);
    const line = quote.lines.find((item) => item.skuId === skuId);
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

function safeReturnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/products";
}

function withCartError(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}cart=unavailable`;
}
