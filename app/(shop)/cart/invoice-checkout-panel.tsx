"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ShippingAddressFields,
  emptyShippingAddress,
  isShippingAddressComplete,
  shippingAddressPayload,
} from "@/app/(shop)/cart/shipping-address-fields";

interface InvoiceCheckoutItem {
  skuId: string;
  quantity: number;
}

interface InvoiceCheckoutResponse {
  orderId: string;
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  status: "pending_payment";
  paymentDueAt: string;
  allocationExpiresAt: string;
}

interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

export function InvoiceCheckoutPanel({
  disabled = false,
  items,
  supabaseAnonKey,
  supabaseUrl,
}: {
  disabled?: boolean;
  items: InvoiceCheckoutItem[];
  supabaseAnonKey: string;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [shippingAddress, setShippingAddress] = useState(emptyShippingAddress);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<InvoiceCheckoutResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const supabaseKey = supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
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
      router.push(`/auth/sign-in?next=${encodeURIComponent("/cart?channel=b2b")}`);
      throw new Error("Sign in is required before invoice checkout");
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
      router.push(`/auth/sign-in?next=${encodeURIComponent("/cart?channel=b2b")}`);
    }
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Invoice request failed");
    }

    return payload as T;
  }

  async function requestInvoice() {
    if (disabled || items.length === 0 || creating || result) return;
    if (!isShippingAddressComplete(shippingAddress)) {
      setMessage("Complete the required delivery address fields before requesting an invoice");
      return;
    }
    if (!reference.trim()) {
      setMessage("A unique PO or invoice reference is required");
      return;
    }

    setCreating(true);
    setMessage(null);

    try {
      const invoice = await authenticatedJson<InvoiceCheckoutResponse>("/api/checkout/invoice", {
        method: "POST",
        body: JSON.stringify({
          items,
          shippingAddress: shippingAddressPayload(shippingAddress),
          purchaseOrderReference: reference.trim(),
        }),
      });
      setResult(invoice);
      setMessage("Invoice order created within the approved credit and reservation policy.");

      try {
        await authenticatedJson<{ cleared: true }>("/api/cart/clear", { method: "POST" });
        router.refresh();
      } catch {
        setMessage("Invoice order created. Refresh the cart after the order appears.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice request failed");
    } finally {
      setCreating(false);
    }
  }

  const addressReady = isShippingAddressComplete(shippingAddress);
  const referenceReady = Boolean(reference.trim());

  return (
    <div className="mt-4 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <ShippingAddressFields
        disabled={disabled || creating || Boolean(result)}
        onChange={setShippingAddress}
        value={shippingAddress}
      />
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        PO or invoice reference
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          disabled={disabled || creating || Boolean(result)}
          maxLength={120}
          name="purchaseOrderReference"
          onChange={(event) => setReference(event.target.value)}
          placeholder="Required and unique for this account"
          required
          value={reference}
        />
      </label>
      <p className="text-xs text-zinc-600">
        Invoice checkout is available only when staff has approved account terms, a positive credit
        limit, and the active B2B invoice policy. Stock is released automatically if the displayed
        reservation deadline passes before reconciliation.
      </p>
      <button
        className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-zinc-400"
        disabled={
          disabled ||
          !addressReady ||
          !referenceReady ||
          creating ||
          items.length === 0 ||
          Boolean(result)
        }
        onClick={requestInvoice}
        type="button"
      >
        {creating ? "Creating invoice" : "Request invoice / PO checkout"}
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-zinc-600">
          {message}
        </p>
      ) : null}
      {result ? (
        <div className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">Invoice reference: {result.providerPaymentId}</p>
          <p className="text-xs font-semibold text-zinc-700">
            Total: {formatMoney(result.amountCents, result.currency)}
          </p>
          <p className="text-xs text-zinc-600">
            Stock reserved until {formatDateTime(result.allocationExpiresAt)}
          </p>
          <p className="text-xs text-zinc-600">
            Payment due by {formatDateTime(result.paymentDueAt)}
          </p>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
            href={`/orders/${result.orderId}`}
          >
            View invoice order
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
