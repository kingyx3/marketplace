"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { addCartItem, clearCart, readCart, removeCartItem, updateCartItem, writeCart } from "@/lib/cart";
import { getSkuQuote } from "@/lib/catalog";
import { getEnv } from "@/lib/env";
import { stripeCurrency } from "@/lib/money";
import { createStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

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

export async function startCheckout() {
  const cart = await readCart();
  if (cart.length === 0) {
    redirect("/cart?error=empty");
  }

  const user = await requireUser("/cart");
  const quote = await getSkuQuote(cart);
  const env = getEnv();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .rpc("create_checkout_order_from_cart", {
      p_auth_user_id: user.id,
      p_items: cart.map((item) => ({ sku_id: item.skuId, quantity: item.quantity })),
      p_channel: "b2c",
    })
    .single();

  if (error || !data) {
    console.error("checkout order creation failed:", error?.message ?? "missing result");
    redirect("/cart?error=inventory");
  }

  const order = data as {
    order_id: string;
    customer_id: string;
    subtotal_cents: number;
    total_cents: number;
    currency: string;
  };

  const stripe = createStripeClient();
  let checkoutUrl: string | null = null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      client_reference_id: order.order_id,
      success_url: `${env.NEXT_PUBLIC_SITE_URL}/account/orders/${order.order_id}?checkout=success`,
      cancel_url: `${env.NEXT_PUBLIC_SITE_URL}/cart?checkout=cancelled`,
      metadata: {
        order_id: order.order_id,
        customer_id: order.customer_id,
        auth_user_id: user.id,
      },
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          order_id: order.order_id,
          customer_id: order.customer_id,
          auth_user_id: user.id,
        },
      },
      line_items: quote.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: stripeCurrency(line.currency),
          unit_amount: line.unitPriceCents,
          product_data: {
            name: line.name,
            metadata: {
              sku_id: line.skuId,
              sku: line.sku,
            },
          },
        },
      })),
    });

    checkoutUrl = session.url;
  } catch (checkoutError) {
    await supabase.rpc("release_order_allocation", { p_order_id: order.order_id });
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.order_id);
    console.error(
      "stripe checkout creation failed:",
      checkoutError instanceof Error ? checkoutError.message : "unknown error"
    );
    redirect("/cart?error=payment");
  }

  await clearCart();
  redirect(checkoutUrl ?? "/cart?error=payment");
}
