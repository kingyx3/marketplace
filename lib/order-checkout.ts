import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiCustomerContext } from "@/lib/api/auth";
import {
  ambiguousExternalResult,
  badRequest,
  conflict,
  internalError,
  serviceUnavailable,
} from "@/lib/api/errors";
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
import {
  applicationUrl,
  createHitPayClient,
  isHitPayRequestError,
  type HitPayClient,
} from "@/lib/hitpay";
import { logError } from "@/lib/observability";
import { shippingAddressSchema, type ShippingAddress } from "@/lib/shipping";

export function checkoutResponseBody(result: CheckoutResult) {
  return baseCheckoutResponseBody(result);
}

export function checkoutReturnUrl(
  requestedUrl: string | undefined,
  orderId: string,
  currentOrigin: string | undefined = undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredAppUrl = new URL(applicationUrl("/", env));
  const appUrl = checkoutApplicationUrl(currentOrigin, configuredAppUrl);
  const trustedOrigins = new Set([appUrl.origin, configuredAppUrl.origin]);
  let destination: "cart" | "order" = "cart";

  if (requestedUrl) {
    try {
      const requested = new URL(requestedUrl);
      if (
        trustedOrigins.has(requested.origin) &&
        requested.pathname === "/orders"
      ) {
        destination = "order";
      }
    } catch {
      // Fall back to the cart destination for malformed or untrusted return URLs.
    }
  }

  // Keep the provider return public. An authenticated destination can force a
  // fresh OAuth flow when a browser does not restore the session after leaving
  // HitPay, obscuring a successful payment with an unrelated sign-in error.
  const target = new URL("/checkout/return", appUrl);
  target.searchParams.set("order", orderId);
  target.searchParams.set("destination", destination);
  return target.toString();
}

function checkoutApplicationUrl(currentOrigin: string | undefined, fallback: URL): URL {
  if (!currentOrigin) return fallback;

  try {
    const current = new URL(currentOrigin);
    if (!["http:", "https:"].includes(current.protocol)) return fallback;
    return new URL(current.origin);
  } catch {
    return fallback;
  }
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient(),
  currentOrigin?: string,
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  if (request.mode === "preorder") {
    return createPreorderCheckoutPayment(auth, request, hitpay);
  }

  const shippingAddress = shippingAddressSchema.parse(request.shippingAddress);
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);
  if (quote.totalCents <= 0)
    throw badRequest("Checkout total must be greater than zero");

  let orderId: string | null = null;
  let paymentAttemptId: string | null = null;
  let paymentRequestId: string | null = null;

  try {
    const order = await auth.supabase
      .rpc(
        "create_checkout_order_from_cart",
        checkoutOrderRpcParams(auth.user.id, quote, shippingAddress),
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
      orderData.reservation_expires_at ??
      new Date(Date.now() + 15 * 60_000).toISOString();

    const attempt = await insertPaymentAttempt(auth.supabase, {
      orderId,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });
    paymentAttemptId = attempt.id;

    const paymentRequest = await hitpay.createPaymentRequest({
      amountCents: quote.totalCents,
      currency: quote.currency,
      email: auth.customer.email,
      name: shippingAddress.recipientName || auth.customer.name,
      phone: shippingAddress.phone,
      purpose: `Marketplace order ${orderId}`,
      referenceNumber: `attempt:${attempt.id}`,
      redirectUrl: checkoutReturnUrl(request.successUrl, orderId, currentOrigin),
      expiresAfter: "15 minutes",
    });
    paymentRequestId = paymentRequest.id;
    await updatePaymentAttempt(auth.supabase, attempt.id, {
      status: "provider_succeeded",
      provider_payment_id: paymentRequest.id,
      attempt_count: 1,
    });

    const payment = await insertPayment(auth.supabase, {
      orderId,
      providerPaymentId: paymentRequest.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });
    await updatePaymentAttempt(auth.supabase, attempt.id, {
      status: "succeeded",
      payment_id: payment.id,
      completed_at: new Date().toISOString(),
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
    const outcomeUnknown =
      paymentRequestId !== null ||
      (isHitPayRequestError(error) && error.outcomeUnknown);
    if (paymentAttemptId) {
      try {
        await updatePaymentAttempt(auth.supabase, paymentAttemptId, {
          status: outcomeUnknown ? "result_unknown" : "failed",
          last_error: error instanceof Error ? error.message : String(error),
          next_attempt_at: new Date().toISOString(),
          ...(outcomeUnknown ? {} : { completed_at: new Date().toISOString() }),
        });
      } catch (attemptError) {
        logError("checkout.payment_attempt_update_failed", attemptError, {
          orderId: orderId ?? undefined,
          paymentAttemptId,
          userId: auth.user.id,
        });
      }
    }

    if (outcomeUnknown) {
      logError("checkout.hitpay_result_unknown", error, {
        orderId: orderId ?? undefined,
        paymentAttemptId: paymentAttemptId ?? undefined,
        paymentRequestId: paymentRequestId ?? undefined,
        userId: auth.user.id,
      });
      throw ambiguousExternalResult(
        "We could not confirm the payment-provider result. Your order is reserved while we reconcile it.",
      );
    }

    await rollbackFailedOrderCheckout(auth.supabase, {
      orderId,
      paymentRequestId,
      hitpay,
    });
    if (isHitPayRequestError(error)) {
      logError("checkout.hitpay_request_failed", error, {
        orderId: orderId ?? undefined,
        paymentAttemptId: paymentAttemptId ?? undefined,
        userId: auth.user.id,
      });
      throw serviceUnavailable(
        "Payment checkout is temporarily unavailable. Please try again.",
      );
    }
    throw error instanceof Error ? error : internalError();
  }
}

export function checkoutOrderRpcParams(
  authUserId: string,
  quote: CheckoutQuote,
  shippingAddress: ShippingAddress,
) {
  return {
    p_auth_user_id: authUserId,
    p_items: quote.lines.map((line) => ({
      product_id: line.productId,
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
      "Some stock is currently reserved by another checkout or has sold out. Refresh your cart before trying again.",
    );
  }
  if (
    normalized.includes("checkout subtotal changed") ||
    normalized.includes("checkout total changed")
  ) {
    return conflict(
      "Prices or availability changed. Review the refreshed cart before payment.",
    );
  }
  return new Error(message);
}

async function insertPaymentAttempt(
  supabase: SupabaseClient,
  input: { orderId: string; amountCents: number; currency: string },
): Promise<{ id: string; idempotencyKey: string }> {
  const { data, error } = await supabase
    .from("payment_attempts")
    .insert({
      order_id: input.orderId,
      provider: "hitpay",
      amount_cents: input.amountCents,
      currency: input.currency,
      status: "calling_provider",
      attempt_count: 1,
    })
    .select("id, idempotency_key")
    .single();

  if (error || !data)
    throw new Error(error?.message ?? "payment attempt insert failed");
  return { id: String(data.id), idempotencyKey: String(data.idempotency_key) };
}

async function updatePaymentAttempt(
  supabase: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("payment_attempts")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function insertPayment(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
  },
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

  if (error || !data)
    throw new Error(error?.message ?? "payment insert failed");
  return { id: data.id };
}

async function rollbackFailedOrderCheckout(
  supabase: SupabaseClient,
  input: {
    orderId: string | null;
    paymentRequestId: string | null;
    hitpay: HitPayClient;
  },
): Promise<void> {
  if (input.paymentRequestId) {
    try {
      await input.hitpay.cancelPaymentRequest(input.paymentRequestId);
    } catch {
      // Reservation expiry and signed webhook reconciliation remain authoritative.
    }
  }

  if (input.orderId) {
    await supabase.rpc("release_order_allocation", {
      p_order_id: input.orderId,
    });
    await supabase
      .from("payments")
      .update({ status: "cancelled" })
      .eq("order_id", input.orderId);
    await supabase
      .from("orders")
      .update({ status: "cancelled", checkout_reserved_until: null })
      .eq("id", input.orderId);
  }
}
