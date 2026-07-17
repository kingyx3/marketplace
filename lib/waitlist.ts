import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CustomerRecord } from "@/lib/api/auth";
import { badRequest, notFound } from "@/lib/api/errors";
import { getAppName } from "@/lib/app-config";
import {
  claimNotification,
  providers,
  updateNotification,
  type NotificationChannel,
  type NotificationMessage,
} from "@/lib/notifications";

type WaitlistChannel = Extract<NotificationChannel, "email" | "telegram" | "whatsapp">;

interface EnvLike {
  APP_NAME?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  [key: string]: string | undefined;
}

export const joinWaitlistRequestSchema = z.object({
  skuId: z.string().uuid(),
  channel: z.enum(["email", "telegram", "whatsapp"]).default("email"),
  contact: z.string().trim().max(255).optional(),
});

export type JoinWaitlistRequest = z.infer<typeof joinWaitlistRequestSchema>;

export interface CustomerWaitlistEntry {
  id: string;
  skuId: string;
  sku: string;
  productName: string;
  productSlug: string;
  channel: WaitlistChannel;
  contact: string;
  status: "active" | "notified" | "cancelled";
  createdAt: string;
  updatedAt: string;
  notifiedAt: string | null;
}

export interface DropNotificationResult {
  waitlistEntryId: string;
  channel: NotificationChannel;
  status: "sent" | "skipped" | "failed" | "duplicate";
  notificationId?: string;
  providerMessageId?: string;
  error?: string;
}

export async function joinWaitlist(
  supabase: SupabaseClient,
  customer: CustomerRecord,
  input: JoinWaitlistRequest
): Promise<CustomerWaitlistEntry> {
  const parsed = joinWaitlistRequestSchema.parse(input);
  const sku = await fetchWaitlistSku(supabase, parsed.skuId);
  const contact = normalizeWaitlistContact(parsed.channel, parsed.contact, customer.email);

  const { data, error } = await supabase
    .from("waitlist_entries")
    .upsert(
      {
        customer_id: customer.id,
        sku_id: sku.id,
        channel: parsed.channel,
        contact,
        status: "active",
        notified_at: null,
      },
      { onConflict: "customer_id,sku_id,channel" }
    )
    .select(WAITLIST_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("waitlist entry was not saved");
  }

  return mapWaitlistEntry(data as unknown as WaitlistRow);
}

export async function listCustomerWaitlist(
  supabase: SupabaseClient,
  customerId: string,
  limit = 10
): Promise<CustomerWaitlistEntry[]> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(WAITLIST_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as WaitlistRow[]).map(mapWaitlistEntry);
}

export async function notifyDropForSku(
  supabase: SupabaseClient,
  skuId: string,
  options: { env?: EnvLike; fetcher?: typeof fetch; limit?: number } = {}
): Promise<DropNotificationResult[]> {
  const env = options.env ?? process.env;
  const sku = await fetchWaitlistSku(supabase, skuId);
  const availability = sku.inventory.reduce(
    (total, row) => total + row.available + row.incoming,
    0
  );
  if (availability <= 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, customer_id, sku_id, channel, contact, status, updated_at")
    .eq("sku_id", skuId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 200);

  if (error) {
    throw new Error(error.message);
  }

  const entries = (data ?? []) as unknown as DropWaitlistRow[];
  const results: DropNotificationResult[] = [];
  for (const entry of entries) {
    results.push(await sendDropNotification(supabase, entry, sku, env, options.fetcher));
  }
  return results;
}

export function normalizeWaitlistContact(
  channel: WaitlistChannel,
  contact: string | undefined,
  fallbackEmail: string
): string {
  if (channel === "email") {
    const value = (contact || fallbackEmail).trim().toLowerCase();
    if (!z.string().email().safeParse(value).success) {
      throw badRequest("A valid email address is required for email alerts");
    }
    return value;
  }

  if (!contact?.trim()) {
    throw badRequest(`${channel} contact is required`);
  }

  if (channel === "telegram") {
    const value = contact.trim();
    if (value.length < 3 || value.length > 128) {
      throw badRequest("Telegram chat ID must be between 3 and 128 characters");
    }
    return value;
  }

  const value = contact.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(value)) {
    throw badRequest("WhatsApp number must include a country code");
  }
  return value;
}

async function sendDropNotification(
  supabase: SupabaseClient,
  entry: DropWaitlistRow,
  sku: WaitlistSkuRow,
  env: EnvLike,
  fetcher?: typeof fetch
): Promise<DropNotificationResult> {
  const message = buildDropNotificationMessage(entry, sku, env);
  const provider = providers[entry.channel];
  const claim = await claimNotification(supabase, message, {
    provider: providerName(entry.channel),
    dedupeKey: message.dedupeKey ?? `drop_alert:${entry.id}:${entry.updated_at}`,
  });

  if (claim.duplicate) {
    return { waitlistEntryId: entry.id, channel: entry.channel, status: "duplicate" };
  }

  if (!provider.isConfigured(env)) {
    await updateNotification(supabase, claim.id, {
      status: "skipped",
      error: `${entry.channel} provider disabled`,
    });
    return {
      waitlistEntryId: entry.id,
      channel: entry.channel,
      status: "skipped",
      notificationId: claim.id,
    };
  }

  const result = await provider.send(message, { env, fetcher });
  if (!result.ok) {
    await updateNotification(supabase, claim.id, {
      status: "failed",
      error: result.error ?? `${entry.channel} provider failure`,
    });
    return {
      waitlistEntryId: entry.id,
      channel: entry.channel,
      status: "failed",
      notificationId: claim.id,
      error: result.error,
    };
  }

  const notifiedAt = new Date().toISOString();
  await updateNotification(supabase, claim.id, {
    status: "sent",
    provider_message_id: result.providerMessageId,
    sent_at: notifiedAt,
  });
  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "notified", notified_at: notifiedAt })
    .eq("id", entry.id);
  if (error) {
    throw new Error(error.message);
  }

  return {
    waitlistEntryId: entry.id,
    channel: entry.channel,
    status: "sent",
    notificationId: claim.id,
    providerMessageId: result.providerMessageId,
  };
}

function buildDropNotificationMessage(
  entry: DropWaitlistRow,
  sku: WaitlistSkuRow,
  env: EnvLike
): NotificationMessage {
  const product = productForSku(sku);
  const appName = getAppName(env);
  const siteUrl = (env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const productPath = `/products/${product.slug}`;
  const productUrl = siteUrl ? `${siteUrl}${productPath}` : productPath;
  const payload = {
    skuId: sku.id,
    sku: sku.sku,
    productName: product.name,
    productUrl,
    appName,
  };
  const text = [
    `${appName} drop alert: ${product.name} is available.`,
    `SKU: ${sku.sku}`,
    `View: ${productUrl}`,
  ].join("\n");

  return {
    channel: entry.channel,
    customerId: entry.customer_id,
    to: entry.contact,
    template: "drop_alert",
    payload,
    subject: `${appName} drop alert: ${product.name}`,
    text,
    html: `<p>${escapeHtml(product.name)} is available.</p><p><a href="${escapeHtml(
      productUrl
    )}">View product</a></p>`,
    dedupeKey: `drop_alert:${entry.id}:${entry.updated_at}`,
  };
}

async function fetchWaitlistSku(supabase: SupabaseClient, skuId: string): Promise<WaitlistSkuRow> {
  const { data, error } = await supabase
    .from("booster_box_skus")
    .select(
      "id, sku, active, inventory(available, incoming), product_variants(products(name, slug, active))"
    )
    .eq("id", skuId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  const row = data as unknown as WaitlistSkuRow | null;
  const product = row ? productForSku(row) : null;
  if (!row || !row.active || !product?.active) {
    throw notFound("SKU is not available for waitlist alerts");
  }
  return row;
}

function mapWaitlistEntry(row: WaitlistRow): CustomerWaitlistEntry {
  const sku = one(row.booster_box_skus);
  const variant = one(sku?.product_variants);
  const product = one(variant?.products);
  return {
    id: row.id,
    skuId: row.sku_id,
    sku: sku?.sku ?? "SKU",
    productName: product?.name ?? sku?.sku ?? "Sealed product",
    productSlug: product?.slug ?? "",
    channel: row.channel as WaitlistChannel,
    contact: row.contact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notifiedAt: row.notified_at,
  };
}

function productForSku(row: WaitlistSkuRow): WaitlistProductRow {
  const variant = one(row.product_variants);
  const product = one(variant?.products);
  return product ?? { name: row.sku, slug: "", active: false };
}

function providerName(channel: NotificationChannel): string {
  if (channel === "email") return "resend";
  if (channel === "telegram") return "telegram";
  if (channel === "whatsapp") return "whatsapp";
  return channel;
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

const WAITLIST_SELECT =
  "id, sku_id, channel, contact, status, created_at, updated_at, notified_at, booster_box_skus(sku, product_variants(products(name, slug)))";

interface WaitlistRow {
  id: string;
  sku_id: string;
  channel: WaitlistChannel;
  contact: string;
  status: "active" | "notified" | "cancelled";
  created_at: string;
  updated_at: string;
  notified_at: string | null;
  booster_box_skus?: WaitlistSkuLookupRow | WaitlistSkuLookupRow[] | null;
}

interface WaitlistSkuLookupRow {
  sku: string;
  product_variants?: WaitlistVariantLookupRow | WaitlistVariantLookupRow[] | null;
}

interface WaitlistVariantLookupRow {
  products?:
    | Pick<WaitlistProductRow, "name" | "slug">
    | Array<Pick<WaitlistProductRow, "name" | "slug">>
    | null;
}

interface DropWaitlistRow {
  id: string;
  customer_id: string;
  sku_id: string;
  channel: NotificationChannel;
  contact: string;
  status: string;
  updated_at: string;
}

interface WaitlistSkuRow {
  id: string;
  sku: string;
  active: boolean;
  inventory: Array<{ available: number; incoming: number }>;
  product_variants?: WaitlistVariantRow | WaitlistVariantRow[] | null;
}

interface WaitlistVariantRow {
  products?: WaitlistProductRow | WaitlistProductRow[] | null;
}

interface WaitlistProductRow {
  name: string;
  slug: string;
  active: boolean;
}
