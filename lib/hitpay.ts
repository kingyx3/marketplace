import { z } from "zod";

const hitPayChargeSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string(),
  refunded_amount: z.union([z.string(), z.number()]).optional(),
  payment_type: z.string().optional(),
});

const hitPayPaymentRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string(),
  url: z.string().url(),
  reference_number: z.string().nullish(),
  payments: z.array(hitPayChargeSchema).optional(),
});

const hitPayRefundSchema = z.object({
  id: z.string().uuid(),
  payment_id: z.string().uuid().optional(),
  status: z.string(),
  currency: z.string().optional(),
  amount_refunded: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
});

export type HitPayCharge = z.infer<typeof hitPayChargeSchema>;
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
  const defaultApiUrl =
    env.TARGET_ENV === "production" ? "https://api.hit-pay.com" : "https://api.sandbox.hit-pay.com";
  const apiUrl = (env.HITPAY_API_URL || defaultApiUrl).replace(/\/$/, "");
  if (!apiKey) throw new Error("HitPay is not configured (HITPAY_API_KEY)");
  if (!/^https:\/\//i.test(apiUrl)) throw new Error("HITPAY_API_URL must use HTTPS");

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
    createPaymentRequest: (input) =>
      request(
        "/v1/payment-requests",
        {
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
        },
        hitPayPaymentRequestSchema
      ),
    getPaymentRequest: (id) =>
      request(
        `/v1/payment-requests/${encodeURIComponent(id)}`,
        { method: "GET" },
        hitPayPaymentRequestSchema
      ),
    cancelPaymentRequest: async (id) => {
      await request(`/v1/payment-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    createRefund: (input) =>
      request(
        "/v1/refund",
        {
          method: "POST",
          body: JSON.stringify({
            payment_id: input.paymentId,
            amount: formatHitPayAmount(input.amountCents),
          }),
        },
        hitPayRefundSchema
      ),
  };
}

export function hitPayPaymentMethods(env: NodeJS.ProcessEnv = process.env): string[] {
  const methods = (env.HITPAY_PAYMENT_METHODS || "paynow_online")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (methods.length === 0) {
    throw new Error("HITPAY_PAYMENT_METHODS must include at least one method");
  }
  return [...new Set(methods)];
}

export function hitPayAmountToCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("HitPay returned an invalid amount");
  }
  return Math.round(amount * 100);
}

export function hitPayRefundStatus(status: string): "pending" | "succeeded" | "failed" {
  const normalized = status.toLowerCase();
  if (["succeeded", "completed", "refunded"].includes(normalized)) return "succeeded";
  if (["failed", "cancelled", "canceled", "rejected"].includes(normalized)) return "failed";
  return "pending";
}

export function successfulHitPayChargeId(payload: Record<string, unknown>): string | null {
  if (!Array.isArray(payload.payments)) return null;
  for (const raw of payload.payments) {
    const result = hitPayChargeSchema.safeParse(raw);
    if (result.success && result.data.status.toLowerCase() === "succeeded") {
      return result.data.id;
    }
  }
  return null;
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
  try {
    return JSON.parse(value);
  } catch {
    return { message: value.slice(0, 500) };
  }
}

function providerErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    if (typeof record[key] === "string") return String(record[key]).slice(0, 500);
  }
  return "";
}
