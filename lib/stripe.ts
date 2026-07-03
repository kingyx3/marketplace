import Stripe from "stripe";

/**
 * Stripe client factory. Pre-orders use PaymentIntents with
 * `capture_method: "manual"` so a deposit can be authorized at
 * pre-order time and the balance captured at allocation/shipping time.
 * See docs/research/07-preorder-workflow.md for the full flow.
 */
export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  }
  return new Stripe(key);
}
