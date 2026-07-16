import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, internalError } from "@/lib/api/errors";
import {
  checkoutRequestSchema,
  quoteCheckout,
  type CheckoutQuote,
  type CheckoutRequest,
} from "@/lib/commerce";
import {
  createCheckoutPayment as createLegacyCheckoutPayment,
  type CheckoutResult,
} from "@/lib/checkout";
import { shippingAddressSchema, type ShippingAddress } from "@/lib/shipping";
import { createStripeClient } from "@/lib/stripe";

export function checkoutResponseBody(result: CheckoutResult) {
  return {
    mode: result.mode,
    orderId: result.orderId,
    preorderId: result.preorderId,
    paymentId: result.paymentId,
    paymentIntentId: result.paymentIntentId,
    clientSecret: result.clientSecret,
    amountCents: result.amountCents,
    currency: result.publishableCurrency,
    quote: result.quote,
  };
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  stripe: Stripe = createStripeClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  if (request.mode === "preorder") {
    return createLegacyCheckoutPayment(auth, request, stripe);
  }

  const shippingAddress = shippingAddressSchema.parse(request.shippingAddress);
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);
  if (quote.totalCents <= 0) {
    throw badRequest("Checkout total must be greater than zero");
  }

  let orderId: string | null = null;
  let paymentIntentId: string | null = null;

  try {
    const order = await auth.supabase
      .rpc(
        "create_checkout_order_from_cart",
        checkoutOrderRpcParams(auth.user.id, quote, shippingAddress)
      )
      .single();
    if (order.error || !order.data) {
      throw new Error(order.error?.message ?? "order creation failed");
    }
    orderId = (order.data as { order_id: string }).order_id;

    const intent = await stripe.paymentIntents.create({
      amount: quote.totalCents,
      currency: quote.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: auth.customer.email,
      shipping: stripeShippingAddress(shippingAddress),
      metadata: {
        kind: "full",
        order_id: orderId,
        customer_id: auth.customer.id,
      },
    });
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      orderId,
      providerPaymentId: intent.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });

    if (!intent.client_secret) {
      throw internalError("Payment intent is missing a client secret");
    }

    return {
      mode: "order",
      orderId,
      paymentId: payment.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      publishableCurrency: quote.currency,
      amountCents: quote.totalCents,
      quote,
    };
  } catch (error) {
    await rollbackFailedOrderCheckout(auth.supabase, { orderId, paymentIntentId, stripe });
    throw error instanceof Error ? error : internalError();
  }
}

export function checkoutOrderRpcParams(
  authUserId: string,
  quote: CheckoutQuote,
  shippingAddress: ShippingAddress
) {
  return {
    p_auth_user_id: authUserId,
    p_items: quote.lines.map((line) => ({
      sku_id: line.skuId,
      quantity: line.quantity,
    })),
    p_channel: "b2c",
    p_shipping_address: shippingAddress,
    p_expected_subtotal_cents: quote.subtotalCents,
    p_discount_cents: quote.discountCents,
    p_discount_bps: quote.discountBps,
    p_expected_total_cents: quote.totalCents,
  };
}

function stripeShippingAddress(
  address: ShippingAddress
): Stripe.PaymentIntentCreateParams.Shipping {
  return {
    name: address.recipientName,
    phone: address.phone || undefined,
    address: {
      line1: address.line1,
      line2: address.line2 || undefined,
      city: address.city || undefined,
      state: address.region || undefined,
      postal_code: address.postalCode,
      country: address.countryCode,
    },
  };
}

async function insertPayment(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      order_id: input.orderId,
      provider_payment_id: input.providerPaymentId,
      kind: "full",
      amount_cents: input.amountCents,
      currency: input.currency,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "payment insert failed");
  }

  return { id: data.id };
}

async function rollbackFailedOrderCheckout(
  supabase: SupabaseClient,
  input: {
    orderId: string | null;
    paymentIntentId: string | null;
    stripe: Stripe;
  }
): Promise<void> {
  if (input.paymentIntentId) {
    try {
      await input.stripe.paymentIntents.cancel(input.paymentIntentId);
    } catch (error) {
      console.error(
        "Stripe payment intent cancellation failed:",
        error instanceof Error ? error.message : "unknown"
      );
    }
  }

  if (input.orderId) {
    await rollbackAllocatedOrder(supabase, input.orderId);
  }
}

async function rollbackAllocatedOrder(supabase: SupabaseClient, orderId: string): Promise<void> {
  await supabase.rpc("release_order_allocation", { p_order_id: orderId });
  await supabase.from("payments").update({ status: "cancelled" }).eq("order_id", orderId);
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
}
