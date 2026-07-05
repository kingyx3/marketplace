import type { SupabaseClient } from "@supabase/supabase-js";

export type B2bReviewStatus = "none" | "pending" | "approved" | "rejected";

export interface B2bPricingTier {
  id: string;
  code: string;
  name: string;
  discountBps: number;
  minOrderCents: number;
}

export interface WholesaleAccess {
  status: B2bReviewStatus;
  companyName: string | null;
  tiers: B2bPricingTier[];
}

export async function getWholesaleAccess(
  supabase: SupabaseClient,
  customerId: string
): Promise<WholesaleAccess> {
  const account = await supabase
    .from("b2b_accounts")
    .select("id, company_name, approved, review_status")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (account.error) {
    throw new Error(account.error.message);
  }
  if (!account.data) {
    return { status: "none", companyName: null, tiers: [] };
  }

  const accountRow = account.data as {
    id: string;
    company_name: string;
    approved: boolean;
    review_status?: string | null;
  };
  const status = normalizeReviewStatus(accountRow);
  if (status !== "approved") {
    return { status, companyName: accountRow.company_name, tiers: [] };
  }

  const assignments = await supabase
    .from("customer_pricing_tiers")
    .select("pricing_tier_id")
    .eq("customer_id", customerId);
  if (assignments.error) {
    throw new Error(assignments.error.message);
  }

  const tierIds = (assignments.data ?? [])
    .map((row: { pricing_tier_id?: string | null }) => row.pricing_tier_id)
    .filter((id): id is string => Boolean(id));
  if (tierIds.length === 0) {
    return { status, companyName: accountRow.company_name, tiers: [] };
  }

  const tiers = await supabase
    .from("pricing_tiers")
    .select("id, code, name, discount_bps, min_order_cents")
    .in("id", tierIds);
  if (tiers.error) {
    throw new Error(tiers.error.message);
  }

  return {
    status,
    companyName: accountRow.company_name,
    tiers: ((tiers.data ?? []) as PricingTierRow[]).map(mapPricingTier).sort(sortPricingTiers),
  };
}

export function wholesaleIsActive(access: WholesaleAccess | null | undefined): boolean {
  return Boolean(access && access.status === "approved" && access.tiers.length > 0);
}

export function minimumOrderCents(tiers: B2bPricingTier[]): number {
  if (tiers.length === 0) return 0;
  return tiers.reduce(
    (minimum, tier) => Math.min(minimum, tier.minOrderCents),
    Number.POSITIVE_INFINITY
  );
}

export function maxDiscountBps(tiers: B2bPricingTier[]): number {
  return tiers.reduce((best, tier) => Math.max(best, tier.discountBps), 0);
}

export function bestDiscountBpsForSubtotal(
  tiers: B2bPricingTier[],
  subtotalCents: number
): number {
  return tiers.reduce((best, tier) => {
    if (subtotalCents >= tier.minOrderCents && tier.discountBps > best) {
      return tier.discountBps;
    }
    return best;
  }, 0);
}

export function discountedPriceCents(priceCents: number, discountBps: number): number {
  return priceCents - Math.floor((priceCents * discountBps) / 10000);
}

export function formatDiscountBps(discountBps: number): string {
  const percent = discountBps / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function normalizeReviewStatus(account: {
  approved: boolean;
  review_status?: string | null;
}): B2bReviewStatus {
  if (account.review_status === "approved" || account.approved) return "approved";
  if (account.review_status === "rejected") return "rejected";
  return "pending";
}

function mapPricingTier(row: PricingTierRow): B2bPricingTier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    discountBps: Number(row.discount_bps ?? 0),
    minOrderCents: Number(row.min_order_cents ?? 0),
  };
}

function sortPricingTiers(a: B2bPricingTier, b: B2bPricingTier): number {
  return a.minOrderCents - b.minOrderCents || b.discountBps - a.discountBps;
}

interface PricingTierRow {
  id: string;
  code: string;
  name: string;
  discount_bps: number;
  min_order_cents: number;
}
