"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ShippingAddressFields,
  emptyShippingAddress,
  isShippingAddressComplete,
  shippingAddressPayload,
  type ShippingAddressInput,
} from "@/app/(shop)/cart/shipping-address-fields";
import { createApiClient } from "@/lib/api/client";
import { createBrowserSessionProvider } from "@/lib/auth/browser-session";

interface CartCheckoutItem {
  productId: string;
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

interface SavedShippingAddress extends ShippingAddressInput {
  id: string;
  lastUsedAt: string;
}

interface SavedAddressesResponse {
  addresses: SavedShippingAddress[];
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
  initialRecipientName?: string;
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
  initialRecipientName = "",
  disabled = false,
}: CartCheckoutPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "creating" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState(() => blankAddress(initialRecipientName));
  const [savedAddresses, setSavedAddresses] = useState<SavedShippingAddress[]>([]);
  const [addressLoadState, setAddressLoadState] = useState<"idle" | "loading" | "failed">(
    mode === "order" ? "loading" : "idle"
  );
  const [selectedAddressId, setSelectedAddressId] = useState("custom");
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const addressEdited = useRef(false);
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

  useEffect(() => {
    if (!requiresShipping) return;
    let active = true;

    void api
      .request<SavedAddressesResponse>("/api/account/addresses", { method: "GET" })
      .then((result) => {
        if (!active) return;
        const addresses = Array.isArray(result.addresses) ? result.addresses : [];
        setSavedAddresses(addresses);
        setAddressLoadState("idle");

        const firstAddress = addresses[0];
        if (!firstAddress || addressEdited.current) return;
        setSelectedAddressId(firstAddress.id);
        setShippingAddress(addressInput(firstAddress));
      })
      .catch(() => {
        if (!active) return;
        setAddressLoadState("failed");
      });

    return () => {
      active = false;
    };
  }, [api, requiresShipping]);

  async function beginCheckout() {
    if (
      disabled ||
      items.length === 0 ||
      phase === "creating" ||
      (requiresShipping && addressLoadState === "loading")
    ) {
      return;
    }

    const accessToken = await session.getAccessToken();
    if (!accessToken) {
      router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
      return;
    }

    if (requiresShipping && !isShippingAddressComplete(shippingAddress)) {
      setPhase("failed");
      setMessage("Complete the required delivery address fields");
      focusFirstIncompleteShippingField(shippingAddress);
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

  function chooseAddress(addressId: string) {
    setSelectedAddressId(addressId);
    setMessage(null);
    if (addressId === "custom") {
      addressEdited.current = true;
      setShippingAddress(blankAddress(initialRecipientName));
      return;
    }

    const savedAddress = savedAddresses.find((address) => address.id === addressId);
    if (!savedAddress) return;
    addressEdited.current = false;
    setShippingAddress(addressInput(savedAddress));
  }

  function updateShippingAddress(nextAddress: ShippingAddressInput) {
    addressEdited.current = true;
    setSelectedAddressId("custom");
    setShippingAddress(nextAddress);
    if (phase === "failed") {
      setPhase("idle");
      setMessage(null);
    }
  }

  const canCreate =
    !disabled &&
    items.length > 0 &&
    phase !== "creating" &&
    !(requiresShipping && addressLoadState === "loading");
  const primaryActionDisabled = !canCreate;
  const actionLabel =
    phase === "creating"
      ? "Opening HitPay"
      : requiresShipping && addressLoadState === "loading"
        ? "Preparing checkout"
        : startLabel;
  const actionHint = !requiresShipping
    ? "Continue to HitPay's secure hosted checkout."
    : addressLoadState === "loading"
      ? "Loading your saved delivery address before checkout."
      : savedAddresses.length > 0
        ? "Continue with the saved address below, or review and update it before payment."
        : "Enter or review your delivery address below before payment.";

  return (
    <form
      aria-busy={phase === "creating"}
      autoComplete="on"
      className="mt-6 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void beginCheckout();
      }}
    >
      <div className="grid gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <button
          className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={primaryActionDisabled}
          type="submit"
        >
          {actionLabel}
        </button>
        <p className="text-xs leading-5 text-emerald-900">{actionHint}</p>
      </div>

      {requiresShipping ? (
        <>
          {savedAddresses.length > 0 ? (
            <label className="grid gap-1 text-xs font-medium text-zinc-700" htmlFor="saved-address">
              Previously used delivery address
              <select
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                id="saved-address"
                name="saved-address"
                onChange={(event) => chooseAddress(event.target.value)}
                value={selectedAddressId}
              >
                {savedAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {savedAddressLabel(address)}
                  </option>
                ))}
                <option value="custom">Deliver to another address</option>
              </select>
              <span className="font-normal leading-5 text-zinc-500">
                Addresses used for orders are saved to your account for faster checkout.
              </span>
            </label>
          ) : null}

          {addressLoadState === "loading" ? (
            <p aria-live="polite" className="text-xs text-zinc-500">
              Loading saved delivery addresses…
            </p>
          ) : null}
          {addressLoadState === "failed" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Saved addresses could not be loaded. Enter the delivery address below to continue.
            </p>
          ) : null}

          <ShippingAddressFields
            disabled={disabled || phase === "creating"}
            onChange={updateShippingAddress}
            value={shippingAddress}
          />
        </>
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
        disabled={primaryActionDisabled}
        type="submit"
      >
        {actionLabel}
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
    </form>
  );
}

function blankAddress(initialRecipientName: string): ShippingAddressInput {
  return {
    ...emptyShippingAddress,
    recipientName: initialRecipientName.trim(),
  };
}

function addressInput(address: SavedShippingAddress): ShippingAddressInput {
  return {
    recipientName: address.recipientName,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    phone: address.phone,
  };
}

function savedAddressLabel(address: SavedShippingAddress): string {
  const street = [address.line1, address.line2].filter(Boolean).join(", ");
  return `${address.recipientName} — ${street}, ${address.postalCode}`;
}

function focusFirstIncompleteShippingField(address: ShippingAddressInput): void {
  const targetId = !address.recipientName.trim()
    ? "shipping-name"
    : !address.line1.trim()
      ? "shipping-address-line1"
      : !address.postalCode.trim()
        ? "shipping-postal-code"
        : !/^[A-Za-z]{2}$/.test(address.countryCode.trim())
          ? "shipping-country"
          : null;
  if (!targetId) return;
  requestAnimationFrame(() => document.getElementById(targetId)?.focus());
}

function createIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `checkout-${crypto.randomUUID()}`
    : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
