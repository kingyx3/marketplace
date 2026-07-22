import type { SupabaseClient } from "@supabase/supabase-js";

import { hasSupabasePublicEnv } from "@/lib/env";
import { createPublishableClient, createUserClient } from "@/lib/supabase";

export const PUBLIC_DEAL_PREVIEW_LIMIT = 3;

export interface LimitedTimeDeal {
  id: string;
  code: string;
  productId: string;
  referenceCode: string;
  productName: string;
  productSlug: string;
  productImageUrl: string | null;
  title: string;
  description: string | null;
  discountBps: number;
  visibility: "public" | "members";
  startsAt: string;
  endsAt: string;
  regularPriceCents: number;
  dealPriceCents: number;
  savingsCents: number;
  currency: string;
}

interface DealRow {
  id: string;
  code: string;
  product_id: string;
  title: string;
  description: string | null;
  deal_price_cents: number;
  visibility: "public" | "members";
  starts_at: string;
  ends_at: string;
  products: {
    reference_code: string;
    name: string;
    slug: string;
    image_url: string | null;
    price_cents: number;
    currency: string;
    active: boolean;
  } | null;
}

interface ActiveDealPriceRow {
  product_id: string;
  deal_price_cents: number;
  products:
    | { price_cents: number }
    | Array<{ price_cents: number }>
    | null;
}

export async function getStorefrontDeals({
  signedIn,
  limit = signedIn ? 100 : PUBLIC_DEAL_PREVIEW_LIMIT,
}: {
  signedIn: boolean;
  limit?: number;
}): Promise<LimitedTimeDeal[]> {
  if (!hasSupabasePublicEnv()) return [];

  try {
    const supabase = signedIn ? await createUserClient() : createPublishableClient();
    return await queryStorefrontDeals(supabase, limit);
  } catch (error) {
    console.error("limited-time deal lookup failed:", safeErrorMessage(error));
    return [];
  }
}

export async function getStorefrontDealForProduct({
  signedIn,
  productId,
}: {
  signedIn: boolean;
  productId: string;
}): Promise<LimitedTimeDeal | null> {
  if (!hasSupabasePublicEnv()) return null;

  try {
    const supabase = signedIn ? await createUserClient() : createPublishableClient();
    const deals = await queryStorefrontDeals(supabase, 20, productId);
    return deals.sort((a, b) => a.dealPriceCents - b.dealPriceCents)[0] ?? null;
  } catch (error) {
    console.error("Product deal lookup failed:", safeErrorMessage(error));
    return null;
  }
}

export async function getActiveDealPrices(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, number>> {
  const rows = await queryActiveDealPriceRows(supabase, productIds);
  const prices = new Map<string, number>();

  for (const row of rows) {
    const product = one(row.products);
    const originalPriceCents = Number(product?.price_cents);
    const dealPriceCents = Number(row.deal_price_cents);
    if (
      !Number.isInteger(originalPriceCents) ||
      !Number.isInteger(dealPriceCents) ||
      dealPriceCents <= 0 ||
      dealPriceCents >= originalPriceCents
    ) {
      continue;
    }
    prices.set(row.product_id, Math.min(prices.get(row.product_id) ?? dealPriceCents, dealPriceCents));
  }
  return prices;
}

export async function getActiveDealDiscounts(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, number>> {
  const rows = await queryActiveDealPriceRows(supabase, productIds);
  const discounts = new Map<string, number>();

  for (const row of rows) {
    const product = one(row.products);
    const originalPriceCents = Number(product?.price_cents);
    const dealPriceCents = Number(row.deal_price_cents);
    if (dealPriceCents <= 0 || dealPriceCents >= originalPriceCents) continue;
    const discountBps = calculateDealDiscountBps(originalPriceCents, dealPriceCents);
    discounts.set(row.product_id, Math.max(discounts.get(row.product_id) ?? 0, discountBps));
  }
  return discounts;
}

export function calculateDealDiscountBps(
  originalPriceCents: number,
  dealPriceCents: number
): number {
  const original = Math.max(0, Math.trunc(Number(originalPriceCents) || 0));
  const deal = Math.max(0, Math.trunc(Number(dealPriceCents) || 0));
  if (original <= 0 || deal >= original) return 0;
  return normalizedDiscountBps(Math.round(((original - deal) * 10000) / original));
}

export function discountedDealPrice(priceCents: number, discountBps: number): number {
  return Math.max(0, priceCents - calculateDealSavings(priceCents, discountBps));
}

export function calculateDealSavings(amountCents: number, discountBps: number): number {
  return Math.floor((Math.max(0, amountCents) * normalizedDiscountBps(discountBps)) / 10000);
}

export function formatDealDiscount(discountBps: number): string {
  const percentage = normalizedDiscountBps(discountBps) / 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2)}%`;
}

async function queryActiveDealPriceRows(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<ActiveDealPriceRow[]> {
  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length === 0) return [];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("limited_time_deals")
    .select("product_id, deal_price_cents, products!inner(price_cents)")
    .in("product_id", uniqueProductIds)
    .eq("active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("deal_price_cents", { ascending: true });

  if (error) {
    throw new Error(`Limited-time deal pricing failed: ${error.message}`);
  }
  return (data ?? []) as unknown as ActiveDealPriceRow[];
}

async function queryStorefrontDeals(
  supabase: SupabaseClient,
  limit: number,
  productId?: string
): Promise<LimitedTimeDeal[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from("limited_time_deals")
    .select(
      `
        id,
        code,
        product_id,
        title,
        description,
        deal_price_cents,
        visibility,
        starts_at,
        ends_at,
        products!inner(
          reference_code,
          name,
          slug,
          image_url,
          price_cents,
          currency,
          active
        )
      `
    )
    .eq("active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .eq("products.active", true)
    .order("sort_priority", { ascending: true })
    .order("ends_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, limit)));

  if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as DealRow[])
    .map(mapDeal)
    .filter((deal): deal is LimitedTimeDeal => deal !== null);
}

function mapDeal(row: DealRow): LimitedTimeDeal | null {
  const product = row.products;
  if (!product?.active) return null;

  const regularPriceCents = Number(product.price_cents);
  const dealPriceCents = Number(row.deal_price_cents);
  if (
    !Number.isInteger(regularPriceCents) ||
    !Number.isInteger(dealPriceCents) ||
    dealPriceCents <= 0 ||
    dealPriceCents >= regularPriceCents
  ) {
    return null;
  }
  const discountBps = calculateDealDiscountBps(regularPriceCents, dealPriceCents);

  return {
    id: row.id,
    code: row.code,
    productId: row.product_id,
    referenceCode: product.reference_code,
    productName: product.name,
    productSlug: product.slug,
    productImageUrl: product.image_url,
    title: row.title,
    description: row.description,
    discountBps,
    visibility: row.visibility,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    regularPriceCents,
    dealPriceCents,
    savingsCents: regularPriceCents - dealPriceCents,
    currency: product.currency,
  };
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizedDiscountBps(value: number): number {
  return Math.max(0, Math.min(9999, Math.trunc(Number(value) || 0)));
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
