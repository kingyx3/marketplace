import { badRequest } from "@/lib/api/errors";

export interface AdminListingItemInput {
  productId: string;
  titleOverride: string | null;
  badgeLabel: string | null;
  tags: string[];
  maxPerCustomer: number | null;
  preorderReserve: number;
  sortPriority: number;
  featured: boolean;
  availabilityMode: "available_now" | "preorder" | "coming_soon" | "unavailable";
  orderOpenAt: string | null;
  orderCloseAt: string | null;
  releaseDate: string | null;
}

export interface AdminStorefrontConfigurationInput {
  key: string;
  label: string;
  description: string | null;
  value: Record<string, unknown>;
  active: boolean;
}

export interface AdminLimitedTimeDealInput {
  dealId: string | null;
  code: string;
  skuId: string;
  title: string;
  description: string | null;
  discountBps: number;
  visibility: "public" | "members";
  startsAt: string;
  endsAt: string;
  sortPriority: number;
  active: boolean;
}

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:[_:-][a-z0-9]+)*$/;
const DEAL_CODE_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function adminLimitedTimeDealFromForm(formData: FormData): AdminLimitedTimeDealInput {
  const dealId = optionalString(formData, "dealId") ?? null;
  const skuId = requiredString(formData, "skuId");
  const code = requiredString(formData, "code").toLowerCase();
  const title = requiredString(formData, "title");
  const discountBps = requiredInteger(formData, "discountBps");
  const visibility = requiredString(formData, "visibility");
  const startsAt = singaporeDateTimeFromForm(formData, "startsAt");
  const endsAt = singaporeDateTimeFromForm(formData, "endsAt");

  if (dealId && !UUID_PATTERN.test(dealId)) throw badRequest("dealId must be a valid UUID");
  if (!UUID_PATTERN.test(skuId)) throw badRequest("skuId must be a valid UUID");
  if (!DEAL_CODE_PATTERN.test(code)) {
    throw badRequest("deal code must use lowercase words separated by _ or -");
  }
  if (title.length > 160) throw badRequest("deal title must be at most 160 characters");
  if (discountBps < 1 || discountBps > 9000) {
    throw badRequest("discountBps must be between 1 and 9000");
  }
  if (visibility !== "public" && visibility !== "members") {
    throw badRequest("visibility must be public or members");
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw badRequest("deal end must be after its start");
  }

  return {
    dealId,
    code,
    skuId,
    title,
    description: optionalString(formData, "description") ?? null,
    discountBps,
    visibility,
    startsAt,
    endsAt,
    sortPriority: optionalInteger(formData, "sortPriority") ?? 0,
    active: booleanField(formData, "active", true),
  };
}

export function adminLimitedTimeDealStatusFromForm(formData: FormData) {
  const dealId = requiredString(formData, "dealId");
  if (!UUID_PATTERN.test(dealId)) throw badRequest("dealId must be a valid UUID");
  return {
    dealId,
    active: requiredString(formData, "active") === "true",
  };
}

export function adminListingItemFromForm(formData: FormData): AdminListingItemInput {
  const availabilityMode = requiredString(formData, "availabilityMode");
  if (!isAvailabilityMode(availabilityMode)) {
    throw badRequest(
      "availabilityMode must be available now, preorder, coming soon, or unavailable"
    );
  }
  const orderOpenAt = optionalDateTimeFromForm(formData, "orderOpenAt");
  const orderCloseAt = optionalDateTimeFromForm(formData, "orderCloseAt");
  if (orderOpenAt && orderCloseAt && new Date(orderCloseAt) <= new Date(orderOpenAt)) {
    throw badRequest("orderCloseAt must be after orderOpenAt");
  }

  return {
    productId: requiredString(formData, "productId"),
    titleOverride: optionalString(formData, "titleOverride") ?? null,
    badgeLabel: optionalString(formData, "badgeLabel") ?? null,
    tags: tagsFromForm(formData),
    maxPerCustomer: optionalPositiveInteger(formData, "maxPerCustomer"),
    preorderReserve: optionalNonNegativeInteger(formData, "preorderReserve") ?? 0,
    sortPriority: optionalInteger(formData, "sortPriority") ?? 0,
    featured: booleanField(formData, "featured", false),
    availabilityMode,
    orderOpenAt,
    orderCloseAt,
    releaseDate: optionalDateFromForm(formData, "releaseDate"),
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

function tagsFromForm(formData: FormData): string[] {
  const raw = optionalString(formData, "tags");
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\n,]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ].slice(0, 12);
}

function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (!value) throw badRequest(`${key} is required`);
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
  if (value <= 0) throw badRequest(`${key} must be positive`);
  return value;
}

function optionalNonNegativeInteger(formData: FormData, key: string): number | null {
  const value = optionalInteger(formData, key);
  if (value === null) return null;
  if (value < 0) throw badRequest(`${key} must be non-negative`);
  return value;
}

function requiredInteger(formData: FormData, key: string): number {
  const value = optionalInteger(formData, key);
  if (value === null) throw badRequest(`${key} is required`);
  return value;
}

function optionalInteger(formData: FormData, key: string): number | null {
  const raw = optionalString(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw badRequest(`${key} must be an integer`);
  return value;
}

function booleanField(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  if (values.length === 0) return defaultValue;
  return values.some((value) => value === "true" || value === "on");
}

function singaporeDateTimeFromForm(formData: FormData, key: string): string {
  const value = requiredString(formData, key);
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)
    ? `${value}+08:00`
    : value;
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${key} must be a valid date and time`);
  return parsed.toISOString();
}

function optionalDateTimeFromForm(formData: FormData, key: string): string | null {
  if (!optionalString(formData, key)) return null;
  return singaporeDateTimeFromForm(formData, key);
}

function optionalDateFromForm(formData: FormData, key: string): string | null {
  const value = optionalString(formData, key);
  if (!value) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  ) {
    throw badRequest(`${key} must be a valid date`);
  }
  return value;
}

function isAvailabilityMode(value: string): value is AdminListingItemInput["availabilityMode"] {
  return ["available_now", "preorder", "coming_soon", "unavailable"].includes(value);
}
