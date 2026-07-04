"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCartItem, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";

export async function addToCart(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);

  await writeCart(addCartItem(await readCart(), skuId, quantity));
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
