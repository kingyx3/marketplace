import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppName } from "@/lib/app-config";
import { formatMoney } from "@/lib/money";

export type NotificationChannel = "email" | "sms" | "telegram" | "whatsapp";

export type NotificationStatus = "queued" | "sent" | "failed" | "skipped";

interface EnvLike {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SUPPORT_EMAIL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  [key: string]: string | undefined;
}

export interface NotificationMessage {
  channel: NotificationChannel;
  customerId: string;
  to: string;
  template: string;
  payload: Record<string, unknown>;
  subject?: string;
  html?: string;
  text?: string;
  dedupeKey?: string;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  isConfigured(env?: EnvLike): boolean;
  send(
    message: NotificationMessage,
    options?: { env?: EnvLike; fetcher?: typeof fetch }
  ): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
}

export interface OrderConfirmationResult {
  ok: boolean;
  status: "sent" | "skipped" | "failed" | "duplicate" | "not_payable";
  notificationId?: string;
  providerMessageId?: string;
  error?: string;
}

const resendEmailProvider: NotificationProvider = {
  channel: "email",
  isConfigured(env = process.env) {
    return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  },
  async send(message, options = {}) {
    const env = options.env ?? process.env;
    const fetcher = options.fetcher ?? fetch;
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
      return { ok: false, error: "email provider disabled" };
    }

    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(message.dedupeKey ? { "Idempotency-Key": message.dedupeKey } : {}),
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const body = await safeJson(response);
    if (!response.ok) {
      return { ok: false, error: resendErrorMessage(body, response.status) };
    }

    const providerMessageId = typeof body?.id === "string" ? body.id : undefined;
    return { ok: true, providerMessageId };
  },
};

const telegramProvider: NotificationProvider = {
  channel: "telegram",
  isConfigured(env = process.env) {
    return Boolean(env.TELEGRAM_BOT_TOKEN);
  },
  async send(message, options = {}) {
    const env = options.env ?? process.env;
    const fetcher = options.fetcher ?? fetch;
    if (!env.TELEGRAM_BOT_TOKEN) {
      return { ok: false, error: "telegram provider disabled" };
    }

    const text = message.text ?? message.subject ?? "";
    if (!text.trim()) {
      return { ok: false, error: "telegram message body is required" };
    }

    const response = await fetcher(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.to,
          text,
          disable_web_page_preview: true,
        }),
      }
    );

    const body = await safeJson(response);
    if (!response.ok) {
      return { ok: false, error: telegramErrorMessage(body, response.status) };
    }

    const result = body?.result;
    const providerMessageId =
      result && typeof result === "object" && "message_id" in result
        ? String((result as { message_id?: unknown }).message_id)
        : undefined;
    return { ok: true, providerMessageId };
  },
};

const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  isConfigured(env = process.env) {
    return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  },
  async send(message, options = {}) {
    const env = options.env ?? process.env;
    const fetcher = options.fetcher ?? fetch;
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return { ok: false, error: "whatsapp provider disabled" };
    }

    const text = message.text ?? message.subject ?? "";
    if (!text.trim()) {
      return { ok: false, error: "whatsapp message body is required" };
    }

    const response = await fetcher(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const body = await safeJson(response);
    if (!response.ok) {
      return { ok: false, error: whatsappErrorMessage(body, response.status) };
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const first = messages[0];
    const providerMessageId =
      first && typeof first === "object" && "id" in first
        ? String((first as { id?: unknown }).id)
        : undefined;
    return { ok: true, providerMessageId };
  },
};

function stubProvider(
  channel: NotificationChannel,
  requiredEnvKeys: string[]
): NotificationProvider {
  return {
    channel,
    isConfigured: (env = process.env) => requiredEnvKeys.every((key) => Boolean(env[key])),
    async send() {
      return { ok: false, error: `${channel} provider not implemented` };
    },
  };
}

export const providers: Record<NotificationChannel, NotificationProvider> = {
  email: resendEmailProvider,
  sms: stubProvider("sms", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]),
  telegram: telegramProvider,
  whatsapp: whatsappProvider,
};

export function configuredChannels(env: EnvLike = process.env): NotificationChannel[] {
  return (Object.keys(providers) as NotificationChannel[]).filter((channel) =>
    providers[channel].isConfigured(env)
  );
}

export async function sendOrderConfirmationEmail(
  supabase: SupabaseClient,
  orderId: string,
  options: { env?: EnvLike; fetcher?: typeof fetch } = {}
): Promise<OrderConfirmationResult> {
  const env = options.env ?? process.env;
  const order = await fetchOrderForConfirmation(supabase, orderId);
  if (!["paid", "packing", "shipped", "delivered"].includes(order.status)) {
    return { ok: true, status: "not_payable" };
  }

  const customer = one(order.customers);
  if (!customer?.email || !order.customer_id) {
    throw new Error("order is missing customer email");
  }

  const message = buildOrderConfirmationMessage(order, customer, env);
  const claim = await claimNotification(supabase, message, {
    provider: "resend",
    dedupeKey: message.dedupeKey ?? `order_confirmation:${order.id}`,
  });

  if (claim.duplicate) {
    return { ok: true, status: "duplicate" };
  }

  if (!providers.email.isConfigured(env)) {
    await updateNotification(supabase, claim.id, {
      status: "skipped",
      error: "email provider disabled",
    });
    return { ok: true, status: "skipped", notificationId: claim.id };
  }

  const result = await providers.email.send(message, options);
  if (!result.ok) {
    await updateNotification(supabase, claim.id, {
      status: "failed",
      error: result.error ?? "email provider failure",
    });
    return {
      ok: false,
      status: "failed",
      notificationId: claim.id,
      error: result.error,
    };
  }

  await updateNotification(supabase, claim.id, {
    status: "sent",
    provider_message_id: result.providerMessageId,
    sent_at: new Date().toISOString(),
  });
  return {
    ok: true,
    status: "sent",
    notificationId: claim.id,
    providerMessageId: result.providerMessageId,
  };
}

async function fetchOrderForConfirmation(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderConfirmationRow> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, customer_id, status, currency, total_cents, placed_at, customers(id, email, name), order_items(quantity, unit_price_cents, booster_box_skus(sku, product_variants(products(name))))"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("order not found");
  }
  return data as OrderConfirmationRow;
}

export async function claimNotification(
  supabase: SupabaseClient,
  message: NotificationMessage,
  options: { provider: string; dedupeKey: string }
): Promise<{ id: string; duplicate: boolean }> {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      customer_id: message.customerId,
      channel: message.channel,
      template: message.template,
      payload: message.payload,
      status: "queued" satisfies NotificationStatus,
      provider: options.provider,
      dedupe_key: options.dedupeKey,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { id: "", duplicate: true };
    }
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("notification claim failed");
  }
  return { id: data.id as string, duplicate: false };
}

export async function updateNotification(
  supabase: SupabaseClient,
  id: string,
  update: {
    status: NotificationStatus;
    provider_message_id?: string;
    sent_at?: string;
    error?: string;
  }
) {
  const { error } = await supabase.from("notifications").update(update).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

function buildOrderConfirmationMessage(
  order: OrderConfirmationRow,
  customer: CustomerRow,
  env: EnvLike
): NotificationMessage {
  const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const supportEmail = env.SUPPORT_EMAIL ?? env.RESEND_FROM_EMAIL ?? "support@example.invalid";
  const appName = getAppName(env);
  const items = (order.order_items ?? []).map((item) => ({
    name: productNameForItem(item),
    sku: skuForItem(item),
    quantity: item.quantity,
    unitPrice: formatMoney(item.unit_price_cents, order.currency),
  }));
  const orderUrl = siteUrl ? `${siteUrl}/orders/${order.id}` : `/orders/${order.id}`;
  const payload = {
    orderId: order.id,
    orderUrl,
    totalCents: order.total_cents,
    currency: order.currency,
    status: order.status,
    placedAt: order.placed_at,
    appName,
    items,
    supportEmail,
  };

  const subject = `${appName} order confirmation ${order.id.slice(0, 8)}`;
  const text = [
    `Thanks${customer.name ? `, ${customer.name}` : ""}. Your ${appName} order is confirmed.`,
    `Order: ${order.id}`,
    `Status: ${order.status}`,
    `Total: ${formatMoney(order.total_cents, order.currency)}`,
    `Items:`,
    ...items.map((item) => `- ${item.quantity} x ${item.name} (${item.sku}) at ${item.unitPrice}`),
    `View: ${orderUrl}`,
    `Support: ${supportEmail}`,
  ].join("\n");
  const html = `
    <div>
      <p>Thanks${customer.name ? `, ${escapeHtml(customer.name)}` : ""}. Your order is confirmed.</p>
      <p>${escapeHtml(appName)} has received your payment and queued the order for fulfillment.</p>
      <p><strong>Order:</strong> ${escapeHtml(order.id)}</p>
      <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
      <p><strong>Total:</strong> ${escapeHtml(formatMoney(order.total_cents, order.currency))}</p>
      <ul>
        ${items
          .map(
            (item) =>
              `<li>${escapeHtml(String(item.quantity))} x ${escapeHtml(item.name)} (${escapeHtml(
                item.sku
              )}) at ${escapeHtml(item.unitPrice)}</li>`
          )
          .join("")}
      </ul>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
      <p>Support: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
    </div>
  `;

  return {
    channel: "email",
    customerId: customer.id,
    to: customer.email,
    template: "order_confirmation",
    payload,
    subject,
    text,
    html,
    dedupeKey: `order_confirmation:${order.id}`,
  };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resendErrorMessage(body: Record<string, unknown> | null, status: number): string {
  const message = body?.message ?? body?.error;
  return typeof message === "string" && message.trim()
    ? `Resend error ${status}: ${message}`
    : `Resend error ${status}`;
}

function telegramErrorMessage(body: Record<string, unknown> | null, status: number): string {
  const message = body?.description ?? body?.error;
  return typeof message === "string" && message.trim()
    ? `Telegram error ${status}: ${message}`
    : `Telegram error ${status}`;
}

function whatsappErrorMessage(body: Record<string, unknown> | null, status: number): string {
  const error = body?.error;
  const message =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : body?.message;
  return typeof message === "string" && message.trim()
    ? `WhatsApp error ${status}: ${message}`
    : `WhatsApp error ${status}`;
}

function productNameForItem(item: OrderItemRow): string {
  const sku = one(item.booster_box_skus);
  const variant = one(sku?.product_variants);
  const product = one(variant?.products);
  return product?.name ?? sku?.sku ?? "Sealed product";
}

function skuForItem(item: OrderItemRow): string {
  const sku = one(item.booster_box_skus);
  return sku?.sku ?? "SKU";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface OrderConfirmationRow {
  id: string;
  customer_id: string | null;
  status: string;
  currency: string;
  total_cents: number;
  placed_at: string | null;
  customers: CustomerRow | CustomerRow[] | null;
  order_items?: OrderItemRow[];
}

interface CustomerRow {
  id: string;
  email: string;
  name: string | null;
}

interface OrderItemRow {
  quantity: number;
  unit_price_cents: number;
  booster_box_skus?: SkuRow | SkuRow[] | null;
}

interface SkuRow {
  sku: string;
  product_variants?: ProductVariantRow | ProductVariantRow[] | null;
}

interface ProductVariantRow {
  products?: ProductRow | ProductRow[] | null;
}

interface ProductRow {
  name: string;
}
