import Stripe from "stripe";

/**
 * Normalize every application PaymentIntent to the single supported checkout
 * method. PayNow is an SGD, single-use payment method, so reusable-method and
 * manual-capture options are intentionally removed here.
 */
export function payNowPaymentIntentParams(
  params: Stripe.PaymentIntentCreateParams
): Stripe.PaymentIntentCreateParams {
  if (params.currency.toLowerCase() !== "sgd") {
    throw new Error("PayNow payments require SGD");
  }

  const normalized: Stripe.PaymentIntentCreateParams = { ...params };
  delete normalized.automatic_payment_methods;
  delete normalized.capture_method;
  delete normalized.setup_future_usage;
  normalized.currency = "sgd";
  normalized.payment_method_types = ["paynow"];
  return normalized;
}

export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  }

  const stripe = new Stripe(key);
  const createPaymentIntent = stripe.paymentIntents.create.bind(stripe.paymentIntents);
  stripe.paymentIntents.create = ((params, options) =>
    createPaymentIntent(payNowPaymentIntentParams(params), options)) as typeof stripe.paymentIntents.create;
  return stripe;
}
