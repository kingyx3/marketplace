#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const write = (file, content) => {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`);
};
const remove = (file) => {
  const target = join(root, file);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
};
const edit = (file, transform) => write(file, transform(read(file)));
const replaceRequired = (file, from, to) => edit(file, (source) => {
  if (!source.includes(from)) throw new Error(`Expected text was not found in ${file}: ${from.slice(0, 100)}`);
  return source.replace(from, to);
});

write("lib/hitpay.ts", `import { z } from "zod";

const hitPayPaymentRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string(),
  url: z.string().url(),
  reference_number: z.string().nullish(),
});

const hitPayRefundSchema = z.object({
  id: z.string().uuid(),
  payment_id: z.string().uuid().optional(),
  status: z.string(),
  currency: z.string().optional(),
  amount_refunded: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
});

export type HitPayPaymentRequest = z.infer<typeof hitPayPaymentRequestSchema>;
export type HitPayRefund = z.infer<typeof hitPayRefundSchema>;

export interface CreateHitPayPaymentRequestInput {
  amountCents: number;
  currency: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  purpose: string;
  referenceNumber: string;
  redirectUrl: string;
  expiresAfter?: string;
}

export interface HitPayClient {
  createPaymentRequest(input: CreateHitPayPaymentRequestInput): Promise<HitPayPaymentRequest>;
  getPaymentRequest(id: string): Promise<HitPayPaymentRequest>;
  cancelPaymentRequest(id: string): Promise<void>;
  createRefund(input: { paymentId: string; amountCents: number }): Promise<HitPayRefund>;
}

export function createHitPayClient(env: NodeJS.ProcessEnv = process.env): HitPayClient {
  const apiKey = env.HITPAY_API_KEY?.trim();
  const apiUrl = (env.HITPAY_API_URL || "https://api.sandbox.hit-pay.com").replace(/\\\/$/, "");
  if (!apiKey) throw new Error("HitPay is not configured (HITPAY_API_KEY)");
  if (!/^https:\\/\\//i.test(apiUrl)) throw new Error("HITPAY_API_URL must use HTTPS");

  const request = async <T>(path: string, init: RequestInit, schema?: z.ZodType<T>): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-BUSINESS-API-KEY": apiKey,
        "X-Requested-With": "XMLHttpRequest",
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    const payload = text ? safeJson(text) : {};
    if (!response.ok) {
      const detail = providerErrorMessage(payload);
      throw new Error(`HitPay request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return schema ? schema.parse(payload) : (payload as T);
  };

  return {
    createPaymentRequest: (input) => request("/v1/payment-requests", {
      method: "POST",
      body: JSON.stringify({
        amount: formatHitPayAmount(input.amountCents),
        currency: input.currency.toUpperCase(),
        payment_methods: hitPayPaymentMethods(env),
        email: input.email || undefined,
        name: input.name || undefined,
        phone: input.phone || undefined,
        purpose: input.purpose.slice(0, 255),
        reference_number: input.referenceNumber.slice(0, 255),
        redirect_url: input.redirectUrl,
        allow_repeated_payments: false,
        expires_after: input.expiresAfter ?? "15 minutes",
        send_email: false,
        send_sms: false,
      }),
    }, hitPayPaymentRequestSchema),
    getPaymentRequest: (id) => request(`/v1/payment-requests/${encodeURIComponent(id)}`, {
      method: "GET",
    }, hitPayPaymentRequestSchema),
    cancelPaymentRequest: async (id) => {
      await request(`/v1/payment-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    createRefund: (input) => request("/v1/refund", {
      method: "POST",
      body: JSON.stringify({
        payment_id: input.paymentId,
        amount: formatHitPayAmount(input.amountCents),
      }),
    }, hitPayRefundSchema),
  };
}

export function hitPayPaymentMethods(env: NodeJS.ProcessEnv = process.env): string[] {
  const methods = (env.HITPAY_PAYMENT_METHODS || "paynow_online")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (methods.length === 0) throw new Error("HITPAY_PAYMENT_METHODS must include at least one method");
  return [...new Set(methods)];
}

export function hitPayAmountToCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("HitPay returned an invalid amount");
  return Math.round(amount * 100);
}

export function hitPayRefundStatus(status: string): "pending" | "succeeded" | "failed" {
  const normalized = status.toLowerCase();
  if (["succeeded", "completed", "refunded"].includes(normalized)) return "succeeded";
  if (["failed", "cancelled", "canceled", "rejected"].includes(normalized)) return "failed";
  return "pending";
}

export function applicationUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const base = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function formatHitPayAmount(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("HitPay amount must be a positive integer number of cents");
  }
  return (amountCents / 100).toFixed(2);
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return { message: value.slice(0, 500) }; }
}

function providerErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    if (typeof record[key] === "string") return String(record[key]).slice(0, 500);
  }
  return "";
}
`);

write("lib/checkout.ts", `import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, conflict, internalError, notFound } from "@/lib/api/errors";
import { checkoutRequestSchema, quoteCheckout, type CheckoutQuote, type CheckoutRequest } from "@/lib/commerce";
import { applicationUrl, createHitPayClient, type HitPayClient } from "@/lib/hitpay";

export interface CheckoutResult {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  paymentRequestId: string;
  checkoutUrl: string;
  publishableCurrency: string;
  amountCents: number;
  quote: CheckoutQuote;
  reservationExpiresAt?: string;
}

const cancelCheckoutSchema = z.object({ paymentRequestId: z.string().uuid() });

export function checkoutResponseBody(result: CheckoutResult) {
  return {
    mode: result.mode,
    orderId: result.orderId,
    preorderId: result.preorderId,
    paymentId: result.paymentId,
    paymentRequestId: result.paymentRequestId,
    checkoutUrl: result.checkoutUrl,
    amountCents: result.amountCents,
    currency: result.publishableCurrency,
    quote: result.quote,
    reservationExpiresAt: result.reservationExpiresAt,
  };
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);
  if (quote.totalCents <= 0) throw badRequest("Checkout total must be greater than zero");
  if (quote.mode !== "preorder") throw badRequest("Normal orders must use the shipping-aware checkout flow");
  return createPreorderPayment(auth, quote, hitpay);
}

export async function cancelPendingCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient()
): Promise<{ cancelled: true; orderId?: string; preorderId?: string }> {
  const input = cancelCheckoutSchema.parse(body);
  const payment = await paymentByRequest(auth.supabase, input.paymentRequestId);
  if (!payment) throw notFound("Payment not found");
  if (!['pending', 'requires_capture', 'authorized'].includes(payment.status)) throw conflict("Payment can no longer be cancelled");
  if (payment.order_id) await assertCustomerOrderIsCancellable(auth, payment.order_id);
  if (payment.preorder_id) await assertCustomerPreorderIsCancellable(auth, payment.preorder_id);

  try { await hitpay.cancelPaymentRequest(input.paymentRequestId); } catch {
    // HitPay cannot revoke a PayNow payment after QR generation in every state.
    // Local state is cancelled and a late completion is refunded by the webhook.
  }

  const paymentUpdate = await auth.supabase.from("payments").update({ status: "cancelled" }).eq("id", payment.id).in("status", ["pending", "requires_capture", "authorized"]);
  if (paymentUpdate.error) throw new Error(paymentUpdate.error.message);
  if (payment.order_id) {
    const release = await auth.supabase.rpc("release_order_allocation", { p_order_id: payment.order_id });
    if (release.error) throw new Error(release.error.message);
    const orderUpdate = await auth.supabase.from("orders").update({ status: "cancelled", checkout_reserved_until: null }).eq("id", payment.order_id).in("status", ["draft", "pending_payment"]);
    if (orderUpdate.error) throw new Error(orderUpdate.error.message);
  }
  if (payment.preorder_id) {
    const preorderUpdate = await auth.supabase.from("preorders").update({ status: "cancelled" }).eq("id", payment.preorder_id).eq("status", "pending_payment");
    if (preorderUpdate.error) throw new Error(preorderUpdate.error.message);
  }
  return { cancelled: true, orderId: payment.order_id ?? undefined, preorderId: payment.preorder_id ?? undefined };
}

async function createPreorderPayment(auth: ApiCustomerContext, quote: CheckoutQuote, hitpay: HitPayClient): Promise<CheckoutResult> {
  const line = quote.lines[0];
  if (!line) throw badRequest("Pre-order checkout requires one line");
  let preorderId: string | null = null;
  let paymentRequestId: string | null = null;
  try {
    const preorder = await auth.supabase.from("preorders").insert({
      customer_id: auth.customer.id,
      sku_id: line.skuId,
      channel: "b2c",
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      deposit_cents: quote.totalCents,
      balance_cents: 0,
      currency: quote.currency,
      status: "pending_payment",
    }).select("id").single();
    if (preorder.error || !preorder.data) throw new Error(preorder.error?.message ?? "preorder insert failed");
    preorderId = String(preorder.data.id);
    const request = await hitpay.createPaymentRequest({
      amountCents: quote.totalCents,
      currency: quote.currency,
      email: auth.customer.email,
      name: auth.customer.name,
      purpose: `Pre-order ${line.name}`,
      referenceNumber: `preorder:${preorderId}`,
      redirectUrl: applicationUrl("/orders?checkout=processing#preorders"),
      expiresAfter: "15 minutes",
    });
    paymentRequestId = request.id;
    const payment = await insertPayment(auth.supabase, { preorderId, providerPaymentId: request.id, amountCents: quote.totalCents, currency: quote.currency });
    return {
      mode: "preorder",
      preorderId,
      paymentId: payment.id,
      paymentRequestId: request.id,
      checkoutUrl: request.url,
      publishableCurrency: quote.currency,
      amountCents: quote.totalCents,
      quote,
    };
  } catch (error) {
    await rollbackFailedPreorderCheckout(auth.supabase, { preorderId, paymentRequestId, hitpay });
    throw error instanceof Error ? error : internalError();
  }
}

async function insertPayment(supabase: SupabaseClient, input: { preorderId: string; providerPaymentId: string; amountCents: number; currency: string }): Promise<{ id: string }> {
  const { data, error } = await supabase.from("payments").insert({
    preorder_id: input.preorderId,
    provider: "hitpay",
    provider_payment_id: input.providerPaymentId,
    kind: "full",
    amount_cents: input.amountCents,
    currency: input.currency,
    status: "pending",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "payment insert failed");
  return { id: data.id };
}

async function paymentByRequest(supabase: SupabaseClient, paymentRequestId: string) {
  const { data, error } = await supabase.from("payments").select("id, order_id, preorder_id, kind, status").eq("provider", "hitpay").eq("provider_payment_id", paymentRequestId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; order_id: string | null; preorder_id: string | null; kind: "full"; status: string } | null;
}

async function assertCustomerOrderIsCancellable(auth: ApiCustomerContext, orderId: string): Promise<void> {
  const { data, error } = await auth.supabase.from("orders").select("id, status").eq("id", orderId).eq("customer_id", auth.customer.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Order not found");
  if (!["draft", "pending_payment"].includes(String(data.status))) throw conflict("Order can no longer be cancelled");
}

async function assertCustomerPreorderIsCancellable(auth: ApiCustomerContext, preorderId: string): Promise<void> {
  const { data, error } = await auth.supabase.from("preorders").select("id, status").eq("id", preorderId).eq("customer_id", auth.customer.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Pre-order not found");
  if (String(data.status) !== "pending_payment") throw conflict("Pre-order payment can no longer be cancelled");
}

async function rollbackFailedPreorderCheckout(supabase: SupabaseClient, input: { preorderId: string | null; paymentRequestId: string | null; hitpay: HitPayClient }): Promise<void> {
  if (input.paymentRequestId) { try { await input.hitpay.cancelPaymentRequest(input.paymentRequestId); } catch {} }
  if (input.preorderId) await supabase.from("preorders").update({ status: "cancelled" }).eq("id", input.preorderId);
}
`);

write("lib/order-checkout.ts", `import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, conflict, internalError } from "@/lib/api/errors";
import { checkoutRequestSchema, quoteCheckout, type CheckoutQuote, type CheckoutRequest } from "@/lib/commerce";
import { checkoutResponseBody as baseCheckoutResponseBody, createCheckoutPayment as createPreorderCheckoutPayment, type CheckoutResult } from "@/lib/checkout";
import { applicationUrl, createHitPayClient, type HitPayClient } from "@/lib/hitpay";
import { shippingAddressSchema, type ShippingAddress } from "@/lib/shipping";

export function checkoutResponseBody(result: CheckoutResult) { return baseCheckoutResponseBody(result); }

export async function createCheckoutPayment(auth: ApiCustomerContext, body: unknown, hitpay: HitPayClient = createHitPayClient()): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  if (request.mode === "preorder") return createPreorderCheckoutPayment(auth, request, hitpay);
  const shippingAddress = shippingAddressSchema.parse(request.shippingAddress);
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);
  if (quote.totalCents <= 0) throw badRequest("Checkout total must be greater than zero");
  let orderId: string | null = null;
  let paymentRequestId: string | null = null;
  try {
    const order = await auth.supabase.rpc("create_checkout_order_from_cart", checkoutOrderRpcParams(auth.user.id, quote, shippingAddress)).single();
    if (order.error || !order.data) throw checkoutConflict(order.error?.message ?? "order creation failed");
    const orderData = order.data as { order_id: string; reservation_expires_at?: string | null };
    orderId = orderData.order_id;
    const reservationExpiresAt = orderData.reservation_expires_at ?? new Date(Date.now() + 15 * 60_000).toISOString();
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
    const payment = await insertPayment(auth.supabase, { orderId, providerPaymentId: paymentRequest.id, amountCents: quote.totalCents, currency: quote.currency });
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
    await rollbackFailedOrderCheckout(auth.supabase, { orderId, paymentRequestId, hitpay });
    throw error instanceof Error ? error : internalError();
  }
}

export function checkoutOrderRpcParams(authUserId: string, quote: CheckoutQuote, shippingAddress: ShippingAddress) {
  return {
    p_auth_user_id: authUserId,
    p_items: quote.lines.map((line) => ({ sku_id: line.skuId, quantity: line.quantity })),
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
  if (normalized.includes("stock is reserved") || normalized.includes("insufficient inventory") || normalized.includes("no longer available")) {
    return conflict("Some stock is currently reserved by another checkout or has sold out. Refresh your cart before trying again.");
  }
  if (normalized.includes("checkout subtotal changed") || normalized.includes("checkout total changed")) {
    return conflict("Prices or availability changed. Review the refreshed cart before payment.");
  }
  return new Error(message);
}

async function insertPayment(supabase: SupabaseClient, input: { orderId: string; providerPaymentId: string; amountCents: number; currency: string }): Promise<{ id: string }> {
  const { data, error } = await supabase.from("payments").insert({
    order_id: input.orderId,
    provider: "hitpay",
    provider_payment_id: input.providerPaymentId,
    kind: "full",
    amount_cents: input.amountCents,
    currency: input.currency,
    status: "pending",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "payment insert failed");
  return { id: data.id };
}

async function rollbackFailedOrderCheckout(supabase: SupabaseClient, input: { orderId: string | null; paymentRequestId: string | null; hitpay: HitPayClient }): Promise<void> {
  if (input.paymentRequestId) { try { await input.hitpay.cancelPaymentRequest(input.paymentRequestId); } catch {} }
  if (input.orderId) {
    await supabase.rpc("release_order_allocation", { p_order_id: input.orderId });
    await supabase.from("payments").update({ status: "cancelled" }).eq("order_id", input.orderId);
    await supabase.from("orders").update({ status: "cancelled", checkout_reserved_until: null }).eq("id", input.orderId);
  }
}
`);

write("app/(shop)/cart/checkout-panel.tsx", `"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { ShippingAddressFields, emptyShippingAddress, isShippingAddressComplete, shippingAddressPayload } from "@/app/(shop)/cart/shipping-address-fields";
import { createApiClient } from "@/lib/api/client";
import { createBrowserSessionProvider } from "@/lib/auth/browser-session";

interface CartCheckoutItem { skuId: string; quantity: number; }
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
  const session = useMemo(() => createBrowserSessionProvider(supabaseUrl, supabaseKey), [supabaseUrl, supabaseKey]);
  const api = useMemo(() => createApiClient({
    getAccessToken: () => session.getAccessToken(),
    onUnauthorized: () => router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`),
    timeoutMs: 30_000,
  }), [authRedirectPath, router, session]);

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
      const requestBody = requiresShipping ? { ...baseBody, shippingAddress: shippingAddressPayload(shippingAddress) } : baseBody;
      const result = await api.request<CheckoutResponse>(paymentEndpoint, {
        method: "POST",
        body: requestBody,
        idempotencyKey: checkoutIdempotencyKey.current,
      });
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== "https:") throw new Error("Payment provider returned an invalid checkout URL");
      window.location.assign(checkoutUrl.toString());
    } catch (error) {
      checkoutIdempotencyKey.current = null;
      setPhase("failed");
      setMessage(error instanceof Error && error.message ? error.message : "Checkout could not be started");
      router.refresh();
    }
  }

  const addressReady = !requiresShipping || isShippingAddressComplete(shippingAddress);
  const canCreate = !disabled && addressReady && items.length > 0 && phase !== "creating";
  return (
    <div className="mt-6 grid gap-3">
      {requiresShipping ? <ShippingAddressFields disabled={disabled || phase === "creating"} onChange={setShippingAddress} value={shippingAddress} /> : null}
      <p className="text-xs leading-5 text-zinc-500">
        By continuing, you agree to the <Link className="font-semibold underline" href="/terms">Terms</Link>, <Link className="font-semibold underline" href="/shipping">Shipping Policy</Link>, and <Link className="font-semibold underline" href="/returns">Returns Policy</Link>. Payment is completed on HitPay's secure hosted checkout.
      </p>
      <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400" disabled={!canCreate} onClick={beginCheckout} type="button">
        {phase === "creating" ? "Opening HitPay" : startLabel}
      </button>
      {message ? <div aria-live="polite" className={phase === "failed" ? "rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" : "rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"}>{message}</div> : null}
      <Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500" href="/products">Keep shopping</Link>
    </div>
  );
}

function createIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `checkout-${crypto.randomUUID()}` : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
`);

write("lib/hitpay-webhooks.ts", `import type { SupabaseClient } from "@supabase/supabase-js";

import { createHitPayClient, hitPayAmountToCents, hitPayRefundStatus, type HitPayClient } from "@/lib/hitpay";
import { sendOrderConfirmationEmail } from "@/lib/notifications";

export interface HitPayWebhookEvent {
  object: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function handleHitPayEvent(supabase: SupabaseClient, event: HitPayWebhookEvent, hitpay: HitPayClient = createHitPayClient()): Promise<void> {
  if (event.object === "payment_request" && event.type === "completed") {
    await handlePaymentCompleted(supabase, event.payload, hitpay);
    return;
  }
  if (event.object === "payment_request" && event.type === "failed") {
    await handlePaymentFailed(supabase, event.payload);
    return;
  }
  if (event.object === "charge" && event.type === "updated") {
    await handleChargeUpdated(supabase, event.payload);
  }
}

async function handlePaymentCompleted(supabase: SupabaseClient, payload: Record<string, unknown>, hitpay: HitPayClient): Promise<void> {
  const requestId = requiredString(payload.id, "HitPay webhook is missing payment request id");
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) return;
  const amountCents = payload.amount === undefined ? payment.amount_cents : hitPayAmountToCents(payload.amount as string | number);
  const currency = typeof payload.currency === "string" ? payload.currency : payment.currency;
  if (payment.order_id) {
    const { data, error } = await supabase.rpc("settle_order_payment", {
      p_order_id: payment.order_id,
      p_provider_payment_id: requestId,
      p_amount_cents: amountCents,
      p_currency: currency,
    });
    if (error) throw new Error(error.message);
    if (data === "paid") { await sendOrderConfirmationEmail(supabase, payment.order_id); return; }
    if (data !== "expired" && data !== "not_payable") throw new Error("order payment settlement returned an invalid result");
    await refundNonPayablePayment(supabase, hitpay, payment, data === "expired" ? "checkout_reservation_expired" : "order_not_payable");
    return;
  }
  if (!payment.preorder_id) return;
  const { data, error } = await supabase.rpc("settle_preorder_payment", {
    p_preorder_id: payment.preorder_id,
    p_provider_payment_id: requestId,
    p_amount_cents: amountCents,
    p_currency: currency,
  });
  if (error) throw new Error(error.message);
  if (data === "paid") return;
  if (data !== "not_payable") throw new Error("preorder payment settlement returned an invalid result");
  await refundNonPayablePayment(supabase, hitpay, payment, "preorder_not_payable");
}

async function handlePaymentFailed(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const requestId = requiredString(payload.id, "HitPay webhook is missing payment request id");
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) return;
  await updatePayment(supabase, payment.id, { status: "failed" }, ["pending", "requires_capture", "authorized"]);
  if (payment.order_id) {
    await supabase.rpc("release_order_allocation", { p_order_id: payment.order_id });
    const { error } = await supabase.from("orders").update({ status: "cancelled", checkout_reserved_until: null }).eq("id", payment.order_id).in("status", ["pending_payment", "draft"]);
    if (error) throw new Error(error.message);
  }
  if (payment.preorder_id) {
    const { error } = await supabase.from("preorders").update({ status: "cancelled" }).eq("id", payment.preorder_id).eq("status", "pending_payment");
    if (error) throw new Error(error.message);
  }
}

async function refundNonPayablePayment(supabase: SupabaseClient, hitpay: HitPayClient, payment: PaymentRecord, reason: string): Promise<void> {
  await updatePayment(supabase, payment.id, { status: "captured", captured_at: new Date().toISOString() }, ["pending", "requires_capture", "authorized", "failed", "cancelled"]);
  const refund = await hitpay.createRefund({ paymentId: payment.provider_payment_id, amountCents: payment.amount_cents });
  const status = hitPayRefundStatus(refund.status);
  const { error } = await supabase.from("refunds").upsert({
    payment_id: payment.id,
    provider_refund_id: refund.id,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    reason,
    status,
  }, { onConflict: "provider_refund_id" });
  if (error) throw new Error(error.message);
  if (status === "succeeded") await updatePayment(supabase, payment.id, { status: "refunded" }, ["captured"]);
}

async function handleChargeUpdated(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const refunds = Array.isArray(payload.refunds) ? payload.refunds : [];
  for (const raw of refunds) {
    if (!raw || typeof raw !== "object") continue;
    const refund = raw as Record<string, unknown>;
    if (typeof refund.id !== "string" || typeof refund.status !== "string") continue;
    const { data, error } = await supabase.from("refunds").update({ status: hitPayRefundStatus(refund.status) }).eq("provider_refund_id", refund.id).select("payment_id");
    if (error) throw new Error(error.message);
    if (hitPayRefundStatus(refund.status) !== "succeeded") continue;
    for (const row of data ?? []) await markFullyRefundedIfComplete(supabase, String(row.payment_id));
  }
}

async function markFullyRefundedIfComplete(supabase: SupabaseClient, paymentId: string): Promise<void> {
  const payment = await paymentById(supabase, paymentId);
  if (!payment) return;
  const { data, error } = await supabase.from("refunds").select("amount_cents").eq("payment_id", paymentId).eq("status", "succeeded");
  if (error) throw new Error(error.message);
  const refunded = (data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  if (refunded >= payment.amount_cents) await updatePayment(supabase, paymentId, { status: "refunded" }, ["captured", "cancelled"]);
}

interface PaymentRecord {
  id: string;
  order_id: string | null;
  preorder_id: string | null;
  provider_payment_id: string;
  status: string;
  currency: string;
  amount_cents: number;
}
async function paymentByRequest(supabase: SupabaseClient, requestId: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabase.from("payments").select("id, order_id, preorder_id, provider_payment_id, status, currency, amount_cents").eq("provider", "hitpay").eq("provider_payment_id", requestId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}
async function paymentById(supabase: SupabaseClient, id: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabase.from("payments").select("id, order_id, preorder_id, provider_payment_id, status, currency, amount_cents").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}
async function updatePayment(supabase: SupabaseClient, id: string, update: Record<string, unknown>, allowedStatuses?: string[]): Promise<boolean> {
  let query = supabase.from("payments").update(update).eq("id", id);
  if (allowedStatuses?.length) query = query.in("status", allowedStatuses);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}
`);

write("app/api/webhooks/hitpay/route.ts", `import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { handleHitPayEvent } from "@/lib/hitpay-webhooks";
import { logError, logInfo, logWarn, requestIdFrom, withRequestId } from "@/lib/observability";
import { reportOperationalFailure } from "@/lib/operational-alerts";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/webhooks/hitpay", method: "POST" };
  const respond = (body: unknown, status = 200) => withRequestId(NextResponse.json(body, { status }), requestId);
  const salt = process.env.HITPAY_WEBHOOK_SALT;
  if (!salt) {
    const error = new Error("missing webhook salt");
    logError("hitpay.webhook.not_configured", error, { ...context, status: 503 });
    await reportOperationalFailure({ event: "hitpay.webhook.not_configured", severity: "critical", summary: "HitPay webhook signing is not configured", context: { ...context, status: 503 } }, error);
    return respond({ error: "webhook not configured" }, 503);
  }
  const signature = request.headers.get("hitpay-signature");
  if (!signature) {
    logWarn("hitpay.webhook.missing_signature", { ...context, status: 400 });
    return respond({ error: "missing signature" }, 400);
  }
  const rawBody = await request.text();
  if (!validSignature(rawBody, signature, salt)) {
    logWarn("hitpay.webhook.invalid_signature", { ...context, status: 400 });
    return respond({ error: "invalid signature" }, 400);
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return respond({ error: "invalid payload" }, 400); }
  const object = request.headers.get("hitpay-event-object")?.toLowerCase() || "unknown";
  const type = request.headers.get("hitpay-event-type")?.toLowerCase() || "unknown";
  const eventType = `${object}.${type}`;
  const providerId = typeof payload.id === "string" ? payload.id : "unknown";
  const eventId = `${eventType}:${providerId}:${String(payload.status ?? "unknown")}`;
  const eventContext = { ...context, eventId, eventType };
  const supabase = createServiceClient();
  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "hitpay",
    event_id: eventId,
    event_type: eventType,
    payload: hitPayEventAuditEnvelope({ object, type, payload }),
  });
  if (insertError) {
    if (insertError.code === "23505") return respond({ received: true, duplicate: true });
    logError("hitpay.webhook.storage_failed", insertError, { ...eventContext, status: 500 });
    await reportOperationalFailure({ event: "hitpay.webhook.storage_failed", severity: "critical", summary: "A verified HitPay webhook could not be stored", context: { ...eventContext, status: 500 } }, insertError);
    return respond({ error: "storage failure" }, 500);
  }
  try {
    await handleHitPayEvent(supabase, { object, type, payload });
  } catch (error) {
    await supabase.from("webhook_events").delete().eq("provider", "hitpay").eq("event_id", eventId);
    logError("hitpay.webhook.processing_failed", error, { ...eventContext, status: 500 });
    await reportOperationalFailure({ event: "hitpay.webhook.processing_failed", severity: "critical", summary: "A verified HitPay webhook failed during commercial state processing", context: { ...eventContext, status: 500 } }, error);
    return respond({ error: "processing failure" }, 500);
  }
  logInfo("hitpay.webhook.processed", { ...eventContext, status: 200, durationMs: Date.now() - startedAt });
  return respond({ received: true });
}

export function validSignature(rawBody: string, signature: string, salt: string): boolean {
  const expected = createHmac("sha256", salt).update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export function hitPayEventAuditEnvelope(event: { object: string; type: string; payload: Record<string, unknown> }): Record<string, unknown> {
  return {
    id: typeof event.payload.id === "string" ? event.payload.id : null,
    object: event.object,
    type: event.type,
    status: typeof event.payload.status === "string" ? event.payload.status : null,
    amount: typeof event.payload.amount === "number" || typeof event.payload.amount === "string" ? event.payload.amount : null,
    currency: typeof event.payload.currency === "string" ? event.payload.currency : null,
    referenceNumber: typeof event.payload.reference_number === "string" ? event.payload.reference_number : null,
  };
}
`);

write("scripts/lib/hitpay-webhook.mjs", `const DEFAULT_EVENTS = ["payment_request.completed", "payment_request.failed", "charge.updated"];

export function buildHitPayWebhookConfig(env = process.env) {
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").replace(/\\\/$/, "");
  return {
    apiKey: String(env.HITPAY_API_KEY || ""),
    apiUrl: String(env.HITPAY_API_URL || "https://api.sandbox.hit-pay.com").replace(/\\\/$/, ""),
    siteUrl,
    targetEnv: String(env.TARGET_ENV || ""),
    webhookUrl: siteUrl ? `${siteUrl}/api/webhooks/hitpay` : "",
    webhookId: String(env.HITPAY_WEBHOOK_ID || ""),
    enabledEvents: parseEvents(env.HITPAY_WEBHOOK_ENABLED_EVENTS),
  };
}

export async function hitPayRequest(config, path, init = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BUSINESS-API-KEY": config.apiKey,
      "X-Requested-With": "XMLHttpRequest",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`HitPay API ${response.status}: ${payload.message || payload.error || "request failed"}`);
  return payload;
}

export async function listHitPayWebhooks(config) {
  const result = await hitPayRequest(config, "/v1/webhook-events", { method: "GET" });
  return Array.isArray(result) ? result : Array.isArray(result.data) ? result.data : [];
}

export async function reconcileHitPayWebhook(config) {
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find((item) => item.id === config.webhookId || item.url === config.webhookUrl);
  if (existing) return { action: "verified", webhook: existing };
  const webhook = await hitPayRequest(config, "/v1/webhook-events", {
    method: "POST",
    body: JSON.stringify({ url: config.webhookUrl, event_types: config.enabledEvents }),
  });
  return { action: "created", webhook };
}

export async function verifyHitPayWebhook(config) {
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find((item) => item.id === config.webhookId || item.url === config.webhookUrl);
  if (!existing) throw new Error(`HitPay webhook is not registered for ${config.webhookUrl}`);
  const actual = Array.isArray(existing.event_types) ? existing.event_types : [];
  const missing = config.enabledEvents.filter((event) => !actual.includes(event));
  if (missing.length) throw new Error(`HitPay webhook is missing events: ${missing.join(", ")}`);
  return existing;
}

function parseEvents(value) {
  if (Array.isArray(value)) return value;
  const events = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return events.length ? events : DEFAULT_EVENTS;
}
`);

write("scripts/configure-hitpay.mjs", `#!/usr/bin/env node
import { inspect } from "node:util";
import { buildHitPayWebhookConfig, listHitPayWebhooks, reconcileHitPayWebhook, verifyHitPayWebhook } from "./lib/hitpay-webhook.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply") ? "apply" : args.has("--apply-if-configured") ? "apply-if-configured" : args.has("--verify") ? "verify" : "plan";
const config = buildHitPayWebhookConfig(process.env);
const missing = [["HITPAY_API_KEY", config.apiKey], ["NEXT_PUBLIC_SITE_URL", config.siteUrl], ["TARGET_ENV", config.targetEnv]].filter(([, value]) => !value).map(([key]) => key);
try {
  if (missing.length && mode === "apply-if-configured") {
    console.log(`HitPay webhook configuration skipped. Missing: ${missing.join(", ")}`);
    process.exit(0);
  }
  if (missing.length) throw new Error(`HitPay webhook configuration is missing: ${missing.join(", ")}`);
  if (mode === "plan") {
    const webhooks = await listHitPayWebhooks(config);
    console.log(inspect({ webhookUrl: config.webhookUrl, enabledEvents: config.enabledEvents, existing: webhooks.find((item) => item.id === config.webhookId || item.url === config.webhookUrl) || null }, { colors: false, depth: null }));
  } else if (mode === "verify") {
    const webhook = await verifyHitPayWebhook(config);
    console.log(`HitPay webhook verified: ${webhook.id || webhook.url}`);
  } else {
    const result = await reconcileHitPayWebhook(config);
    console.log(`HitPay webhook ${result.action}: ${result.webhook.id || result.webhook.url}`);
    await verifyHitPayWebhook(config);
  }
} catch (error) {
  console.error(String(error?.message || error).replaceAll(config.apiKey, "[redacted-hitpay-api-key]"));
  process.exit(1);
}
`);

write("scripts/verify-hitpay-staging.mjs", `#!/usr/bin/env node
import { buildHitPayWebhookConfig, verifyHitPayWebhook } from "./lib/hitpay-webhook.mjs";

const config = buildHitPayWebhookConfig(process.env);
if (!config.apiKey || !process.env.HITPAY_WEBHOOK_SALT || !config.siteUrl) {
  throw new Error("HITPAY_API_KEY, HITPAY_WEBHOOK_SALT, and NEXT_PUBLIC_SITE_URL are required");
}
if (process.env.TARGET_ENV !== "production" && !config.apiUrl.includes("sandbox.hit-pay.com")) {
  throw new Error("Non-production environments must use the HitPay sandbox API URL");
}
await verifyHitPayWebhook(config);
console.log(`HitPay ${process.env.TARGET_ENV || "hosted"} configuration verified.`);
`);

write("supabase/migrations/20260721010000_migrate_payments_to_hitpay.sql", `-- Route new payment records through HitPay while preserving historical Stripe rows.
alter table public.payments alter column provider set default 'hitpay';

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('hitpay', 'stripe', 'manual'));

comment on column public.payments.provider is
  'Payment provider. New online payments use hitpay; stripe remains valid for historical audit records.';
`);

write("tests/hitpay.test.ts", `import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHitPayClient, hitPayAmountToCents, hitPayPaymentMethods } from "@/lib/hitpay";
import { validSignature } from "@/app/api/webhooks/hitpay/route";

afterEach(() => vi.unstubAllGlobals());

describe("HitPay client", () => {
  it("uses configured online payment methods", () => {
    expect(hitPayPaymentMethods({ HITPAY_PAYMENT_METHODS: "paynow_online,card" } as NodeJS.ProcessEnv)).toEqual(["paynow_online", "card"]);
  });
  it("converts provider decimal amounts to cents", () => {
    expect(hitPayAmountToCents("12.34")).toBe(1234);
  });
  it("creates hosted payment requests without exposing credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "9ef68e2e-3569-4f69-9f68-04c7e4bb007c", status: "pending", amount: "10.00", currency: "sgd", url: "https://securecheckout.sandbox.hit-pay.com/example" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHitPayClient({ HITPAY_API_KEY: "secret", HITPAY_API_URL: "https://api.sandbox.hit-pay.com", HITPAY_PAYMENT_METHODS: "paynow_online" } as NodeJS.ProcessEnv);
    const result = await client.createPaymentRequest({ amountCents: 1000, currency: "SGD", purpose: "Order", referenceNumber: "order:1", redirectUrl: "https://example.com/cart" });
    expect(result.url).toContain("securecheckout.sandbox.hit-pay.com");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-BUSINESS-API-KEY"]).toBe("secret");
    expect(JSON.parse(init.body).payment_methods).toEqual(["paynow_online"]);
  });
});

describe("HitPay webhook signatures", () => {
  it("validates the raw JSON HMAC", () => {
    const body = JSON.stringify({ id: "payment-request", status: "succeeded" });
    const signature = createHmac("sha256", "salt").update(body).digest("hex");
    expect(validSignature(body, signature, "salt")).toBe(true);
    expect(validSignature(`${body} `, signature, "salt")).toBe(false);
  });
});
`);

// Patch storefront callers.
edit("app/(shop)/cart/page.tsx", (source) => source.replace(/\n\s*publishableKey=\{process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \?\? ""\}/, ""));
edit("app/(shop)/products/[slug]/page.tsx", (source) => source
  .replace("the difference is refunded through Stripe.", "the difference is refunded through HitPay.")
  .replace(/\n\s*clearCartOnSuccess=\{false\}/, "")
  .replace(/\n\s*publishableKey=\{process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \?\? ""\}/, "")
  .replace(/\n\s*returnPath="[^"]*"/, "")
  .replace(/\n\s*successHref="[^"]*"/, "")
  .replace(/\n\s*successLabel="[^"]*"/, ""));

// Patch refund allocation to use HitPay.
edit("lib/preorders.ts", (source) => {
  source = source.replace('import type Stripe from "stripe";\n', 'import type { HitPayClient } from "@/lib/hitpay";\nimport { hitPayRefundStatus } from "@/lib/hitpay";\n');
  source = source.replace("  stripe: Stripe,", "  hitpay: HitPayClient,");
  const start = source.indexOf("      const refund = await stripe.refunds.create(");
  const endMarker = "      refundCents += row.refund_cents;";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Unable to patch preorder refund block");
  const replacement = `      const refund = await hitpay.createRefund({\n        paymentId: row.provider_payment_id,\n        amountCents: row.refund_cents,\n      });\n      const normalizedRefundStatus = hitPayRefundStatus(refund.status);\n      if (normalizedRefundStatus === "failed") {\n        throw conflict(\`HitPay rejected the allocation refund for preorder \${row.preorder_id}\`);\n      }\n      refundId = refund.id;\n      refundStatus = normalizedRefundStatus;\n      refundsCreated += 1;\n      refundCents += row.refund_cents;`;
  return source.slice(0, start) + replacement + source.slice(end + endMarker.length);
});
edit("app/actions/preorder-allocation.ts", (source) => source
  .replace('import { createStripeClient } from "@/lib/stripe";', 'import { createHitPayClient } from "@/lib/hitpay";')
  .replace("createStripeClient()", "createHitPayClient()")
  .replace('message.includes("stripe")', 'message.includes("hitpay")'));
edit("app/api/admin/preorders/allocate/route.ts", (source) => source
  .replace('import { createStripeClient } from "@/lib/stripe";', 'import { createHitPayClient } from "@/lib/hitpay";')
  .replaceAll("createStripeClient()", "createHitPayClient()"));

// Provider-aware operational exception events.
edit("lib/orders.ts", (source) => source.replace(
  '        "payment_intent.succeeded",\n        "payment_intent.payment_failed",\n        "payment_intent.amount_capturable_updated",',
  '        "payment_request.completed",\n        "payment_request.failed",\n        "charge.updated",'
));

// Health/readiness contract.
write("lib/readiness.ts", read("lib/readiness.ts")
  .replaceAll("STRIPE_SECRET_KEY", "HITPAY_API_KEY")
  .replaceAll("STRIPE_WEBHOOK_SECRET", "HITPAY_WEBHOOK_SALT")
  .replaceAll("stripe", "hitpay")
  .replaceAll("Stripe", "HitPay")
  .replace("secretKey: \"configured\" | \"fail\";", "apiKey: \"configured\" | \"fail\";")
  .replace("webhookSecret: \"configured\" | \"fail\";", "webhookSalt: \"configured\" | \"fail\";")
  .replaceAll("secretKey", "apiKey")
  .replaceAll("webhookSecret", "webhookSalt")
  .replace('env.HITPAY_API_KEY?.startsWith("sk_")', 'Boolean(env.HITPAY_API_KEY?.trim())')
  .replace('env.HITPAY_WEBHOOK_SALT?.startsWith("whsec_")', 'Boolean(env.HITPAY_WEBHOOK_SALT?.trim())'));

// Provider configuration and environment contract.
edit("scripts/configure-providers.mjs", (source) => source.replace('["Stripe", "scripts/configure-stripe.mjs"]', '["HitPay", "scripts/configure-hitpay.mjs"]'));
const contract = JSON.parse(read("config/environment-contract.json"));
const stripeKeys = new Set(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_ENDPOINT_ID"]);
const firstStripe = contract.findIndex((item) => stripeKeys.has(item.key));
const filteredContract = contract.filter((item) => !stripeKeys.has(item.key));
const hitpayEntries = [
  { key: "HITPAY_API_KEY", section: "HitPay", required: true, secret: true, hint: "HitPay server-side business API key", validator: { type: "nonempty" } },
  { key: "HITPAY_WEBHOOK_SALT", section: "HitPay", required: true, secret: true, hint: "HitPay webhook HMAC salt", validator: { type: "nonempty" } },
  { key: "HITPAY_API_URL", section: "HitPay", required: true, secret: false, hint: "HitPay API base URL", validator: { type: "url", protocols: ["https:"] }, default: "https://api.sandbox.hit-pay.com" },
  { key: "HITPAY_PAYMENT_METHODS", section: "HitPay", required: true, secret: false, hint: "Comma-separated HitPay online payment method codes", validator: { type: "pattern", value: "^[a-z0-9_]+(?:,[a-z0-9_]+)*$" }, default: "paynow_online" },
  { key: "HITPAY_WEBHOOK_ID", section: "HitPay hosted provisioning", required: false, secret: false, deployOnly: true, hint: "Registered HitPay webhook identifier", validator: { type: "nonempty" } },
];
filteredContract.splice(Math.max(0, firstStripe), 0, ...hitpayEntries);
write("config/environment-contract.json", JSON.stringify(filteredContract, null, 2));
const environments = JSON.parse(read("config/environments.json"));
delete environments.shared.STRIPE_WEBHOOK_ENABLED_EVENTS;
environments.shared.HITPAY_API_URL = "https://api.sandbox.hit-pay.com";
environments.shared.HITPAY_PAYMENT_METHODS = "paynow_online";
environments.shared.HITPAY_WEBHOOK_ENABLED_EVENTS = ["payment_request.completed", "payment_request.failed", "charge.updated"];
environments.environments.production.HITPAY_API_URL = "https://api.hit-pay.com";
write("config/environments.json", JSON.stringify(environments, null, 2));

// Package scripts/dependencies. npm install in the workflow regenerates the lockfile.
const packageJson = JSON.parse(read("package.json"));
packageJson.scripts["verify:hosted:hitpay"] = "node scripts/verify-hitpay-staging.mjs";
delete packageJson.scripts["verify:hosted:stripe"];
delete packageJson.dependencies["stripe"];
delete packageJson.dependencies["@stripe/react-stripe-js"];
delete packageJson.dependencies["@stripe/stripe-js"];
write("package.json", JSON.stringify(packageJson, null, 2));

// Replace provider keys and route references in active automation/docs/tests.
const replacements = [
  ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "HITPAY_API_URL"],
  ["STRIPE_SECRET_KEY", "HITPAY_API_KEY"],
  ["STRIPE_WEBHOOK_SECRET", "HITPAY_WEBHOOK_SALT"],
  ["STRIPE_WEBHOOK_ENDPOINT_ID", "HITPAY_WEBHOOK_ID"],
  ["STRIPE_WEBHOOK_ENABLED_EVENTS", "HITPAY_WEBHOOK_ENABLED_EVENTS"],
  ["verify-stripe-staging.mjs", "verify-hitpay-staging.mjs"],
  ["configure-stripe.mjs", "configure-hitpay.mjs"],
  ["provision-stripe-webhook.mjs", "configure-hitpay.mjs"],
  ["/api/webhooks/stripe", "/api/webhooks/hitpay"],
  ["verify:hosted:stripe", "verify:hosted:hitpay"],
];
const textExtensions = new Set([".md", ".mjs", ".js", ".ts", ".tsx", ".json", ".yml", ".yaml", ".example"]);
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if ([".git", "node_modules", ".next"].includes(entry)) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) { walk(absolute); continue; }
    const rel = relative(root, absolute).replaceAll("\\\\", "/");
    if (rel.startsWith("supabase/migrations/") || rel === "scripts/agent-migrate-hitpay.mjs") continue;
    const ext = rel.endsWith(".env.example") ? ".example" : rel.slice(rel.lastIndexOf("."));
    if (!textExtensions.has(ext)) continue;
    let source = readFileSync(absolute, "utf8");
    let changed = false;
    for (const [from, to] of replacements) {
      if (source.includes(from)) { source = source.replaceAll(from, to); changed = true; }
    }
    if (changed) writeFileSync(absolute, source);
  }
}
walk(root);

// Rewrite known workflow variable names that should not map a public Stripe key to the HitPay API URL.
for (const workflow of [".github/workflows/deploy.yml", ".github/workflows/configure-providers.yml", ".github/workflows/bootstrap-environment.yml", ".github/workflows/hosted-release-gates.yml"]) {
  if (!existsSync(join(root, workflow))) continue;
  edit(workflow, (source) => source
    .replace(/\n\s*HITPAY_API_URL: \$\{\{ vars\.HITPAY_API_URL \}\}/g, "\n      HITPAY_API_URL: ${{ vars.HITPAY_API_URL }}")
    .replace(/\n\s*HITPAY_API_KEY: \$\{\{ secrets\.HITPAY_API_KEY \}\}/g, "\n      HITPAY_API_KEY: ${{ secrets.HITPAY_API_KEY }}")
    .replace(/\n\s*HITPAY_WEBHOOK_SALT: \$\{\{ secrets\.HITPAY_WEBHOOK_SALT \}\}/g, "\n      HITPAY_WEBHOOK_SALT: ${{ secrets.HITPAY_WEBHOOK_SALT }}"));
}

// Remove obsolete provider implementation/tests and temporary migration automation.
for (const file of [
  "lib/stripe.ts",
  "lib/stripe-webhooks.ts",
  "lib/stripe-webhooks-safe.ts",
  "app/api/webhooks/stripe",
  "scripts/configure-stripe.mjs",
  "scripts/provision-stripe-webhook.mjs",
  "scripts/verify-stripe-staging.mjs",
  "scripts/lib/stripe-webhook.mjs",
  "tests/stripe-refunds.test.ts",
  "tests/stripe-payment-method.test.ts",
  "tests/stripe-webhook-privacy.test.ts",
]) remove(file);

// Proxy allows the new public webhook route.
if (existsSync(join(root, "proxy.ts"))) edit("proxy.ts", (source) => source.replaceAll("stripe", "hitpay"));

// Keep historical database migrations immutable, but remove active Stripe defaults from fresh bootstrap SQL through the new migration.
// Generated environment artifacts are refreshed by the workflow after this script exits.
console.log("HitPay migration source changes applied.");
