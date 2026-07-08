import { badRequest } from "@/lib/api/errors";
import type { SalesChannel } from "@/lib/commerce";

export interface AdminListingItemInput {
  productId: string;
  titleOverride: string | null;
  badgeLabel: string | null;
  tags: string[];
  channels: SalesChannel[];
  maxPerCustomer: number | null;
  preorderReserve: number;
  sortPriority: number;
  featured: boolean;
  published: boolean;
}

export interface AdminStorefrontConfigurationInput {
  key: string;
  label: string;
  description: string | null;
  value: Record<string, unknown>;
  active: boolean;
}

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:[_:-][a-z0-9]+)*$/;
const CHANNELS: SalesChannel[] = ["b2c", "b2b"];

export function adminListingItemFromForm(formData: FormData): AdminListingItemInput {
  const channels = channelsFromForm(formData);

  return {
    productId: requiredString(formData, "productId"),
    titleOverride: optionalString(formData, "titleOverride") ?? null,
    badgeLabel: optionalString(formData, "badgeLabel") ?? null,
    tags: tagsFromForm(formData),
    channels,
    maxPerCustomer: optionalPositiveInteger(formData, "maxPerCustomer"),
    preorderReserve: optionalNonNegativeInteger(formData, "preorderReserve") ?? 0,
    sortPriority: optionalInteger(formData, "sortPriority") ?? 0,
    featured: booleanField(formData, "featured", false),
    published: booleanField(formData, "published", true),
  };
}

export function adminStorefrontConfigurationFromForm(
  formData: FormData
): AdminStorefrontConfigurationInput {
  const key = requiredString(formData, "key").toLowerCase();
  if (!CONFIG_KEY_PATTERN.test(key)) {
    throw badRequest("configuration key must use lowercase words separated by _, :, or -");
  }

  const valueJson = requiredString(formData, "valueJson");
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    throw badRequest("configuration value must be valid JSON");
  }

  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw badRequest("configuration value must be a JSON object");
  }

  return {
    key,
    label: requiredString(formData, "label"),
    description: optionalString(formData, "description") ?? null,
    value: value as Record<string, unknown>,
    active: booleanField(formData, "active", true),
  };
}

function channelsFromForm(formData: FormData): SalesChannel[] {
  const rawChannels = formData.getAll("channels").filter((value): value is SalesChannel => {
    return typeof value === "string" && CHANNELS.includes(value as SalesChannel);
  });

  return [...new Set(rawChannels)].length > 0 ? [...new Set(rawChannels)] : ["b2c"];
}

function tagsFromForm(formData: FormData): string[] {
  const raw = optionalString(formData, "tags");
  if (!raw) return [];

  return [...new Set(raw.split(/[\n,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}

function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (!value) {
    throw badRequest(`${key} is required`);
  }
  return value;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalPositiveInteger(formData: FormData, key: string): number | null {
  const value = optionalInteger(formData, key);
  if (value === null) return null;
  if (value <= 0) {
    throw badRequest(`${key} must be positive`);
  }
  return value;
}

function optionalNonNegativeInteger(formData: FormData, key: string): number | null {
  const value = optionalInteger(formData, key);
  if (value === null) return null;
  if (value < 0) {
    throw badRequest(`${key} must be non-negative`);
  }
  return value;
}

function optionalInteger(formData: FormData, key: string): number | null {
  const raw = optionalString(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw badRequest(`${key} must be an integer`);
  }
  return value;
}

function booleanField(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  if (values.length === 0) return defaultValue;
  return values.some((value) => value === "true" || value === "on");
}
