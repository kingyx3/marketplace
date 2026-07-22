export type CheckoutReturnTone = "success" | "warning" | "danger";

export interface CheckoutReturnState {
  title: string;
  description: string;
  label: string;
  tone: CheckoutReturnTone;
}

export function checkoutReturnState(
  status: string | undefined,
): CheckoutReturnState {
  switch (status?.trim().toLowerCase()) {
    case "paid":
      return {
        title: "Thank you for your order",
        description:
          "Your payment is confirmed and your order is ready for fulfilment.",
        label: "Payment confirmed",
        tone: "success",
      };
    case "completed":
    case "succeeded":
      return {
        title: "Payment submitted",
        description:
          "HitPay reported completion, but the signed webhook is still being reconciled with your order.",
        label: "Confirmation pending",
        tone: "warning",
      };
    case "reconciliation_delayed":
      return {
        title: "Confirmation is taking longer than usual",
        description:
          "We have preserved your order and are reconciling the provider result. Do not submit another payment.",
        label: "Reconciliation delayed",
        tone: "warning",
      };
    case "failed":
    case "expired":
      return {
        title: "Payment was not completed",
        description:
          "No completed payment was reported. Return to your cart when you are ready to try again.",
        label:
          status.trim().toLowerCase() === "expired"
            ? "Checkout expired"
            : "Payment failed",
        tone: "danger",
      };
    case "canceled":
    case "cancelled":
      return {
        title: "Checkout cancelled",
        description:
          "Your payment was not completed. Your cart is still available when you return.",
        label: "Not charged",
        tone: "warning",
      };
    default:
      return {
        title: "We are checking your payment",
        description:
          "Payment confirmation can take a moment. You can safely continue while your order updates.",
        label: "Confirmation pending",
        tone: "warning",
      };
  }
}

export function checkoutReturnDestination(
  orderId: string | undefined,
  destination: string | undefined,
): { href: string; label: string } {
  if (destination === "order" && isUuid(orderId)) {
    return {
      href: `/orders/${encodeURIComponent(orderId)}?checkout=processing`,
      label: "View order",
    };
  }

  const cartUrl = new URL("https://marketplace.invalid/cart");
  cartUrl.searchParams.set("checkout", "processing");
  if (isUuid(orderId)) cartUrl.searchParams.set("order", orderId);
  return {
    href: `${cartUrl.pathname}${cartUrl.search}`,
    label: "Return to cart",
  };
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}
