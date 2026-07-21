import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, conflict, internalError, serviceUnavailable } from "@/lib/api/errors";
import {
  checkoutRequestSchema,
  quoteCheckout,
  type CheckoutQuote,
  type CheckoutRequest,
} from "@/lib/commerce";
import {
  checkoutResponseBody as baseCheckoutResponseBody,
  createCheckoutPayment as createPreorderCheckoutPayment,
  type CheckoutResult,
} from "@/lib/checkout";
import { applicationUrl, createHitPayClient, type HitPayClient } from "@/lib/hitpay";
import { logError } from "@/lib/observability";
import { shippingAddressSchema, type ShippingAddress } from "@/lib/shipping";

export function checkoutResponseBody(result: CheckoutResult) {
  return baseCheckoutResponseBody(result);
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  if (request.mode === "preorder") {
    return createPreorderCheckoutPayment(auth, request, hitpay);
  }

  const shippingAddress = shippingAddressSchema.parse(request.shippingAddress);
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);
  if (quote.totalCents <= 0) throw badRequest("Checkout total must be greater than zero");

  let orderId: string | null = null;
  let paymentRequestId: string | null = null;

  try {
    const order = await auth.supabase
      .rpc(
        "create_checkout_order_from_cart",
        checkoutOrderRpcParams(auth.user.id, quote, shippingAddress)
      )
      .single();
    if (order.error || !order.data) {
      throw checkoutConflict(order.error?.message ?? "order creation failed");
    }

    const orderData = order.data as {
      order_id: string;
      reservation_expires_at?: string | null;
    };
    orderId = orderData.order_id;
    const reservationExpiresAt =
      orderData.reservation_expires_at ?? new Date(Date.now() + 15 * 60_000).toISOString();

    const paymentRequest = await hitpay.createPaymentRequest({
      amountCents: quote.totalCents,
      currency: quote.currency,
      email: auth.customer.email,
      name: shippingAddress.recipientName || auth.customer.name,
      phone: shippingAddress.phone,
      purpose: `Marketplace order ${orderId}`,
      referenceNumber: `order:${orderId}`,
      redirectUrl: applicationUrl(`/cart?checkout=processing&order=${encodeURIComponent(orderId)}`),
      expiresAfter: "15 minutes",
    });
    paymentRequestId = paymentRequest.id;

    const payment = await insertPayment(auth.supabase, {
      orderId,
      providerPaymentId: paymentRequest.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });

    return {
      mode: "order",
      orderId,
      paymentId: payment.id,
      paymentRequestId: paymentRequest.id,
      checkoutUrl: paymentRequest.url,
      publishableCurrency: quote.currency,
      amountCents: quote.totalCents,
      quote,
      reservationExpiresAt,
    };
  } catch (error) {
    await rollbackFailedOrderCheckout(auth.supabase, {
      orderId,
      paymentRequestId,
      hitpay,
    });
    if (isHitPayRequestError(error)) {
      logError("checkout.hitpay_request_failed", error, {
        orderId: orderId ?? undefined,
        paymentRequestId: paymentRequestId ?? undefined,
        userId: auth.user.id,
      });
      throw serviceUnavailable("Payment checkout is temporarily unavailable. Please try again.");
    }
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

function checkoutConflict(message: string): Error {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("stock is reserved") ||
    normalized.includes("insufficient inventory") ||
    normalized.includes("no longer available")
  ) {
    return conflict(
      "Some stock is currently reserved by another checkout or has sold out. Refresh your cart before trying again."
    );
  }
  if (
    normalized.includes("checkout subtotal changed") ||
    normalized.includes("checkout total changed")
  ) {
    return conflict("Prices or availability changed. Review the refreshed cart before payment.");
  }
  return new Error(message);
}

function isHitPayRequestError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("HitPay request failed (");
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
      provider: "hitpay",
      provider_payment_id: input.providerPaymentId,
      kind: "full",
      amount_cents: input.amountCents,
      currency: input.currency,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "payment insert failed");
  return { id: data.id };
}

async function rollbackFailedOrderCheckout(
  supabase: SupabaseClient,
  input: {
    orderId: string | null;
    paymentRequestId: string | null;
    hitpay: HitPayClient;
  }
): Promise<void> {
  if (input.paymentRequestId) {
    try {
      await input.hitpay.cancelPaymentRequest(input.paymentRequestId);
    } catch {
      // Reservation expiry and signed webhook reconciliation remain authoritative.
    }
  }

  if (input.orderId) {
    await supabase.rpc("release_order_allocation", { p_order_id: input.orderId });
    await supabase.from("payments").update({ status: "cancelled" }).eq("order_id", input.orderId);
    await supabase
      .from("orders")
      .update({ status: "cancelled", checkout_reserved_until: null })
      .eq("id", input.orderId);
  }
}
