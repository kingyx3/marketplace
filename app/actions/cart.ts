"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/auth";
import { addCartItem, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";
import { getProductQuote } from "@/lib/catalog";
import { getCustomerOrder } from "@/lib/orders";
import { prepareReorderCart } from "@/lib/reorder";
import { createSecretClient } from "@/lib/supabase";

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

export async function buyAgainFromOrder(formData: FormData) {
  const orderId = orderIdFrom(formData);
  if (!orderId) redirect("/orders?reorder=unavailable");

  const { customer } = await requireCustomer(`/orders/${orderId}`);
  const supabase = createSecretClient();
  let order: Awaited<ReturnType<typeof getCustomerOrder>>;

  try {
    order = await getCustomerOrder(supabase, customer, orderId);
  } catch {
    redirect("/orders?reorder=unavailable");
  }

  const preparation = await prepareReorderCart(
    await readCart(),
    order.order_items ?? [],
    getProductQuote,
  );

  if (!preparation.ok) {
    const outcome = preparation.reason === "cart_limit" ? "cart-limit" : "unavailable";
    redirect(`/orders/${orderId}?reorder=${outcome}`);
  }

  await writeCart(preparation.items);
  revalidatePath("/cart");
  redirect("/cart");
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

function orderIdFrom(formData: FormData): string | null {
  const orderId = String(formData.get("orderId") ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    orderId,
  )
    ? orderId
    : null;
}

function safeReturnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/products";
}

function withCartError(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}cart=unavailable`;
}
