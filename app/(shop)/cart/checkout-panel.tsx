"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  ShippingAddressFields,
  emptyShippingAddress,
  isShippingAddressComplete,
  shippingAddressPayload,
} from "@/app/(shop)/cart/shipping-address-fields";
import { createApiClient } from "@/lib/api/client";
import { createBrowserSessionProvider } from "@/lib/auth/browser-session";

interface CartCheckoutItem {
  skuId: string;
  quantity: number;
}

interface CheckoutResponse {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  paymentRequestId: string;
  checkoutUrl: string;
  amountCents: number;
  currency: string;
  reservationExpiresAt?: string;
}

interface CartCheckoutPanelProps {
  items: CartCheckoutItem[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  mode?: "order" | "preorder";
  paymentEndpoint?: string;
  paymentBody?: Record<string, unknown>;
  authRedirectPath?: string;
  startLabel?: string;
  disabled?: boolean;
}

export function CartCheckoutPanel({
  items,
  supabaseUrl,
  supabaseAnonKey,
  mode = "order",
  paymentEndpoint = "/api/checkout",
  paymentBody,
  authRedirectPath = "/cart",
  startLabel = "Place Order",
  disabled = false,
}: CartCheckoutPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "creating" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState(emptyShippingAddress);
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const requiresShipping = mode === "order";
  const supabaseKey = supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const session = useMemo(
    () => createBrowserSessionProvider(supabaseUrl, supabaseKey),
    [supabaseUrl, supabaseKey]
  );
  const api = useMemo(
    () =>
      createApiClient({
        getAccessToken: () => session.getAccessToken(),
        onUnauthorized: () => {
          router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
        },
        timeoutMs: 30_000,
      }),
    [authRedirectPath, router, session]
  );

  async function beginCheckout() {
    if (disabled || items.length === 0 || phase === "creating") return;
    if (requiresShipping && !isShippingAddressComplete(shippingAddress)) {
      setPhase("failed");
      setMessage("Complete the required delivery address fields");
      return;
    }

    setPhase("creating");
    setMessage("Reserving stock and opening secure HitPay checkout…");
    checkoutIdempotencyKey.current ??= createIdempotencyKey();

    try {
      const baseBody = paymentBody ?? { mode, channel: "b2c", items };
      const requestBody = requiresShipping
        ? { ...baseBody, shippingAddress: shippingAddressPayload(shippingAddress) }
        : baseBody;
      const result = await api.request<CheckoutResponse>(paymentEndpoint, {
        method: "POST",
        body: requestBody,
        idempotencyKey: checkoutIdempotencyKey.current,
      });
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== "https:") {
        throw new Error("Payment provider returned an invalid checkout URL");
      }
      window.location.assign(checkoutUrl.toString());
    } catch (error) {
      checkoutIdempotencyKey.current = null;
      setPhase("failed");
      setMessage(
        error instanceof Error && error.message ? error.message : "Checkout could not be started"
      );
      router.refresh();
    }
  }

  const addressReady = !requiresShipping || isShippingAddressComplete(shippingAddress);
  const canCreate = !disabled && addressReady && items.length > 0 && phase !== "creating";

  return (
    <div className="mt-6 grid gap-3">
      {requiresShipping ? (
        <ShippingAddressFields
          disabled={disabled || phase === "creating"}
          onChange={setShippingAddress}
          value={shippingAddress}
        />
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        By continuing, you agree to the{" "}
        <Link className="font-semibold underline" href="/terms">
          Terms
        </Link>
        ,{" "}
        <Link className="font-semibold underline" href="/shipping">
          Shipping Policy
        </Link>
        , and{" "}
        <Link className="font-semibold underline" href="/returns">
          Returns Policy
        </Link>
        . Payment is completed on HitPay&apos;s secure hosted checkout.
      </p>

      <button
        className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={!canCreate}
        onClick={beginCheckout}
        type="button"
      >
        {phase === "creating" ? "Opening HitPay" : startLabel}
      </button>

      {message ? (
        <div
          aria-live="polite"
          className={
            phase === "failed"
              ? "rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              : "rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"
          }
        >
          {message}
        </div>
      ) : null}

      <Link
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
        href="/products"
      >
        Keep shopping
      </Link>
    </div>
  );
}

function createIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `checkout-${crypto.randomUUID()}`
    : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
