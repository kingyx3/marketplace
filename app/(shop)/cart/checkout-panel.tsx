"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import {
  ShippingAddressFields,
  emptyShippingAddress,
  isShippingAddressComplete,
  shippingAddressPayload,
} from "@/app/(shop)/cart/shipping-address-fields";

type CheckoutPhase =
  | "idle"
  | "creating"
  | "ready"
  | "confirming"
  | "succeeded"
  | "processing"
  | "failed"
  | "canceling"
  | "cancelled";

interface CartCheckoutItem {
  skuId: string;
  quantity: number;
}

interface CheckoutResponse {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  currency: string;
  quote?: {
    discountCents: number;
    shippingCents: number;
    shippingService: string | null;
    taxCents: number;
    totalCents: number;
  };
}

interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

interface CartCheckoutPanelProps {
  items: CartCheckoutItem[];
  publishableKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mode?: "order" | "preorder";
  channel?: "b2c" | "b2b";
  paymentEndpoint?: string;
  paymentBody?: Record<string, unknown>;
  clearCartOnSuccess?: boolean;
  authRedirectPath?: string;
  returnPath?: string;
  startLabel?: string;
  successHref?: string;
  successLabel?: string;
  disabled?: boolean;
}

export function CartCheckoutPanel({
  items,
  publishableKey,
  supabaseUrl,
  supabaseAnonKey,
  mode = "order",
  channel = "b2c",
  paymentEndpoint = "/api/checkout",
  paymentBody,
  clearCartOnSuccess = true,
  authRedirectPath = "/cart",
  returnPath = "/cart?checkout=processing",
  startLabel = "Pay securely",
  successHref,
  successLabel,
  disabled = false,
}: CartCheckoutPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [shippingAddress, setShippingAddress] = useState(emptyShippingAddress);
  const requiresShipping = mode === "order";
  const supabaseKey = supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );
  const supabase = useMemo(
    () => (supabaseUrl && supabaseKey ? createBrowserClient(supabaseUrl, supabaseKey) : null),
    [supabaseUrl, supabaseKey]
  );

  async function accessToken(): Promise<string> {
    if (!supabase) {
      throw new Error("Authentication is not configured");
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
      throw new Error("Sign in is required before checkout");
    }
    return data.session.access_token;
  }

  async function authenticatedJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await accessToken();
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as ApiErrorResponse;

    if (response.status === 401) {
      router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
    }
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Checkout request failed");
    }

    return payload as T;
  }

  async function beginCheckout() {
    if (disabled || items.length === 0 || phase === "creating") return;
    if (requiresShipping && !isShippingAddressComplete(shippingAddress)) {
      setPhase("failed");
      setMessage("Complete the required delivery address fields before checkout");
      return;
    }
    if (!publishableKey) {
      setPhase("failed");
      setMessage("Stripe publishable key is not configured");
      return;
    }

    setPhase("creating");
    setMessage(null);

    try {
      const baseBody = paymentBody ?? { mode, channel, items };
      const requestBody = requiresShipping
        ? { ...baseBody, shippingAddress: shippingAddressPayload(shippingAddress) }
        : baseBody;
      const result = await authenticatedJson<CheckoutResponse>(paymentEndpoint, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      setCheckout(result);
      setPhase("ready");
      setMessage("Payment is ready. Review the final server-calculated total below.");
    } catch (error) {
      setCheckout(null);
      setPhase("failed");
      setMessage(messageFromError(error, "Checkout could not be started"));
    }
  }

  async function clearCartAfterSuccess() {
    if (!clearCartOnSuccess) {
      router.refresh();
      setMessage("Payment confirmed");
      return;
    }

    try {
      await authenticatedJson<{ cleared: true }>("/api/cart/clear", { method: "POST" });
      router.refresh();
      setMessage("Payment confirmed");
    } catch {
      setMessage("Payment confirmed. Refresh the cart after the order appears.");
    }
  }

  async function cancelCheckout() {
    if (!checkout || phase === "confirming" || phase === "processing" || phase === "succeeded") {
      return;
    }

    setPhase("canceling");
    setMessage(null);

    try {
      await authenticatedJson<{ cancelled: true }>("/api/checkout/cancel", {
        method: "POST",
        body: JSON.stringify({ paymentIntentId: checkout.paymentIntentId }),
      });
      setCheckout(null);
      setPhase("cancelled");
      setMessage("Payment attempt cancelled");
      router.refresh();
    } catch (error) {
      setPhase("failed");
      setMessage(messageFromError(error, "Payment attempt could not be cancelled"));
    }
  }

  const elementsOptions: StripeElementsOptions | undefined = checkout
    ? {
        clientSecret: checkout.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            borderRadius: "6px",
            colorPrimary: "#059669",
            colorText: "#18181b",
          },
        },
      }
    : undefined;

  const addressReady = !requiresShipping || isShippingAddressComplete(shippingAddress);
  const canCreate =
    !disabled && addressReady && items.length > 0 && !checkout && phase !== "creating";

  return (
    <div className="mt-6 grid gap-3">
      {requiresShipping && !checkout ? (
        <ShippingAddressFields
          disabled={disabled || phase === "creating"}
          onChange={setShippingAddress}
          value={shippingAddress}
        />
      ) : null}

      {!checkout ? (
        <p className="text-xs leading-5 text-zinc-500">
          By continuing to payment, you agree to the{" "}
          <Link className="font-semibold underline" href="/terms">
            Terms
          </Link>
          ,{" "}
          <Link className="font-semibold underline" href="/shipping">
            Shipping Policy
          </Link>
          , and{" "}
          <Link className="font-semibold underline" href="/returns">
            Returns and Refunds Policy
          </Link>
          .
        </p>
      ) : null}

      {!checkout ? (
        <button
          className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={!canCreate}
          onClick={beginCheckout}
          type="button"
        >
          {phase === "creating" ? "Preparing payment" : startLabel}
        </button>
      ) : null}

      {checkout?.quote ? (
        <dl className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {checkout.quote.discountCents > 0 ? (
            <div className="flex justify-between gap-4 text-emerald-800">
              <dt>Eligible savings</dt>
              <dd className="font-semibold">Applied in final total</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">Shipping</dt>
            <dd className="font-semibold text-zinc-950">
              {formatMoney(checkout.quote.shippingCents, checkout.currency)}
            </dd>
          </div>
          {checkout.quote.shippingService ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Service</dt>
              <dd className="text-right font-semibold text-zinc-950">
                {checkout.quote.shippingService}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">GST included</dt>
            <dd className="font-semibold text-zinc-950">
              {formatMoney(checkout.quote.taxCents, checkout.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2">
            <dt className="font-semibold text-zinc-950">Final total</dt>
            <dd className="text-base font-bold text-zinc-950">
              {formatMoney(checkout.quote.totalCents, checkout.currency)}
            </dd>
          </div>
        </dl>
      ) : null}

      {checkout && stripePromise && elementsOptions ? (
        <Elements key={checkout.clientSecret} options={elementsOptions} stripe={stripePromise}>
          <PaymentForm
            onCancel={cancelCheckout}
            onFailure={(text) => {
              setPhase("failed");
              setMessage(text);
            }}
            onProcessing={(text) => {
              setPhase("processing");
              setMessage(text);
            }}
            onReady={() => {
              setPhase("ready");
              setMessage(null);
            }}
            onStartConfirm={() => {
              setPhase("confirming");
              setMessage(null);
            }}
            onSuccess={async () => {
              setPhase("succeeded");
              await clearCartAfterSuccess();
            }}
            phase={phase}
            returnPath={returnPath}
          />
        </Elements>
      ) : null}

      {message ? <StatusMessage phase={phase}>{message}</StatusMessage> : null}

      {phase === "succeeded" && (successHref || checkout?.orderId) ? (
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
          href={successHref ?? `/orders/${checkout?.orderId}`}
        >
          {successLabel ?? "View order"}
        </Link>
      ) : (
        <Link
          href="/catalog"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
        >
          Keep shopping
        </Link>
      )}
    </div>
  );
}

function PaymentForm({
  phase,
  onCancel,
  onFailure,
  onProcessing,
  onReady,
  onStartConfirm,
  onSuccess,
  returnPath,
}: {
  phase: CheckoutPhase;
  onCancel: () => void;
  onFailure: (message: string) => void;
  onProcessing: (message: string) => void;
  onReady: () => void;
  onStartConfirm: () => void;
  onSuccess: () => Promise<void>;
  returnPath: string;
}) {
  const stripe = useStripe();
  const elements = useElements();

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || phase === "confirming") return;

    onStartConfirm();
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}${returnPath}`,
      },
    });

    if (result.error) {
      onFailure(result.error.message ?? "Payment was not completed");
      return;
    }

    switch (result.paymentIntent?.status) {
      case "succeeded":
        await onSuccess();
        return;
      case "processing":
        onProcessing("Payment is processing");
        return;
      case "requires_payment_method":
        onFailure("Payment was not completed. Try another payment method.");
        return;
      default:
        onFailure("Payment was not completed. Try again or cancel the attempt.");
    }
  }

  const isConfirming = phase === "confirming";
  const canCancel = !["confirming", "processing", "succeeded", "canceling"].includes(phase);

  return (
    <form className="grid gap-4" onSubmit={submitPayment}>
      <div className="rounded-md border border-zinc-200 p-3">
        <PaymentElement onReady={onReady} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={!stripe || !elements || isConfirming}
          type="submit"
        >
          {isConfirming ? "Confirming" : phase === "failed" ? "Retry payment" : "Confirm payment"}
        </button>
        <button
          className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={!canCancel}
          onClick={onCancel}
          type="button"
        >
          {phase === "canceling" ? "Cancelling" : "Cancel attempt"}
        </button>
      </div>
    </form>
  );
}

function StatusMessage({ children, phase }: { children: ReactNode; phase: CheckoutPhase }) {
  const tone =
    phase === "succeeded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : phase === "processing" || phase === "cancelled"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : phase === "failed"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div aria-live="polite" className={`rounded-md border p-3 text-sm ${tone}`}>
      {children}
    </div>
  );
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}
