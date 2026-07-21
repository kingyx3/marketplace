import type { SupabaseClient } from "@supabase/supabase-js";

import { shippingAddressSchema } from "@/lib/shipping";

export interface SavedShippingAddress {
  id: string;
  recipientName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  lastUsedAt: string;
}

interface OrderAddressRow {
  id: string;
  shipping_address: unknown;
  placed_at: string | null;
  created_at: string;
}

export async function listCustomerAddresses(
  supabase: SupabaseClient,
  customerId: string,
  limit = 8
): Promise<SavedShippingAddress[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 20));
  const { data, error } = await supabase
    .from("orders")
    .select("id, shipping_address, placed_at, created_at")
    .eq("customer_id", customerId)
    .not("shipping_address", "is", null)
    .order("placed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Delivery address lookup failed: ${error.message}`);

  const addresses = new Map<string, SavedShippingAddress>();
  for (const row of (data ?? []) as OrderAddressRow[]) {
    const parsed = shippingAddressSchema.safeParse(row.shipping_address);
    if (!parsed.success) continue;

    const address = parsed.data;
    const key = addressKey(address);
    if (addresses.has(key)) continue;

    addresses.set(key, {
      id: row.id,
      recipientName: address.recipientName,
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city ?? "",
      region: address.region ?? "",
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      phone: address.phone ?? "",
      lastUsedAt: row.placed_at ?? row.created_at,
    });

    if (addresses.size >= boundedLimit) break;
  }

  return [...addresses.values()];
}

function addressKey(address: {
  recipientName: string;
  line1: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
}): string {
  return [
    address.recipientName,
    address.line1,
    address.line2 ?? "",
    address.city ?? "",
    address.region ?? "",
    address.postalCode,
    address.countryCode,
    address.phone ?? "",
  ]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}
