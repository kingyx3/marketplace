import { badRequest } from "@/lib/api/errors";
import {
  MAX_ADMIN_JSON_CHARACTERS,
  POSTGRES_INTEGER_MAX,
  booleanField,
  optionalInteger,
  optionalIsoDate,
  optionalSingaporeDateTime,
  optionalString,
  optionalUuid,
  requiredBoolean,
  requiredSingaporeDateTime,
  requiredString,
  requiredUuid,
} from "@/lib/admin-form-values";

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
  productId: string;
  title: string;
  description: string | null;
  dealPriceCents: number;
  visibility: "public" | "members";
  startsAt: string;
  endsAt: string;
  sortPriority: number;
  active: boolean;
}

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:[_:-][a-z0-9]+)*$/;
const DEAL_CODE_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
export function adminLimitedTimeDealFromForm(formData: FormData): AdminLimitedTimeDealInput {
  const dealId = optionalUuid(formData, "dealId", "dealId");
  const productId = requiredUuid(formData, "productId", "productId");
  const code = requiredString(formData, "code", { max: 80, label: "Deal code" }).toLowerCase();
  const title = requiredString(formData, "title", { max: 160, label: "Deal title" });
  const dealPriceCents = requiredMoneyCents(formData, "dealPrice", "Deal price");
  const visibility = requiredString(formData, "visibility");
  const startsAt = requiredSingaporeDateTime(formData, "startsAt");
  const endsAt = requiredSingaporeDateTime(formData, "endsAt");

  if (!DEAL_CODE_PATTERN.test(code)) {
    throw badRequest("deal code must use lowercase words separated by _ or -");
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
    productId,
    title,
    description:
      optionalString(formData, "description", { max: 500, label: "Deal description" }) ?? null,
    dealPriceCents,
    visibility,
    startsAt,
    endsAt,
    sortPriority: optionalInteger(formData, "sortPriority") ?? 0,
    active: booleanField(formData, "active", true),
  };
}

export function adminLimitedTimeDealStatusFromForm(formData: FormData) {
  return {
    dealId: requiredUuid(formData, "dealId", "dealId"),
    active: requiredBoolean(formData, "active"),
  };
}

export function adminListingPublicationFromForm(formData: FormData) {
  return {
    productId: requiredUuid(formData, "productId", "productId"),
    published: requiredBoolean(formData, "published"),
  };
}

export function adminListingItemFromForm(formData: FormData): AdminListingItemInput {
  const availabilityMode = requiredString(formData, "availabilityMode");
  if (!isAvailabilityMode(availabilityMode)) {
    throw badRequest(
      "availabilityMode must be available now, preorder, coming soon, or unavailable"
    );
  }
  const orderOpenAt = optionalSingaporeDateTime(formData, "orderOpenAt");
  const orderCloseAt = optionalSingaporeDateTime(formData, "orderCloseAt");
  if (orderOpenAt && orderCloseAt && new Date(orderCloseAt) <= new Date(orderOpenAt)) {
    throw badRequest("orderCloseAt must be after orderOpenAt");
  }

  return {
    productId: requiredUuid(formData, "productId", "productId"),
    titleOverride:
      optionalString(formData, "titleOverride", { max: 180, label: "Title override" }) ?? null,
    badgeLabel: optionalString(formData, "badgeLabel", { max: 80, label: "Badge" }) ?? null,
    tags: tagsFromForm(formData),
    maxPerCustomer: optionalInteger(formData, "maxPerCustomer", { min: 1 }),
    preorderReserve: optionalInteger(formData, "preorderReserve", { min: 0 }) ?? 0,
    sortPriority: optionalInteger(formData, "sortPriority") ?? 0,
    featured: booleanField(formData, "featured", false),
    availabilityMode,
    orderOpenAt,
    orderCloseAt,
    releaseDate: optionalIsoDate(formData, "releaseDate"),
  };
}

export function adminStorefrontConfigurationFromForm(
  formData: FormData
): AdminStorefrontConfigurationInput {
  const key = requiredString(formData, "key", {
    max: 120,
    label: "Configuration key",
  }).toLowerCase();
  if (!CONFIG_KEY_PATTERN.test(key)) {
    throw badRequest("configuration key must use lowercase words separated by _, :, or -");
  }

  const valueJson = requiredString(formData, "valueJson", {
    max: MAX_ADMIN_JSON_CHARACTERS,
    label: "Configuration value",
  });
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
    label: requiredString(formData, "label", { max: 160, label: "Configuration label" }),
    description:
      optionalString(formData, "description", {
        max: 500,
        label: "Configuration description",
      }) ?? null,
    value: value as Record<string, unknown>,
    active: booleanField(formData, "active", true),
  };
}

function tagsFromForm(formData: FormData): string[] {
  const raw = optionalString(formData, "tags", { max: 800, label: "Tags" });
  if (!raw) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.split(/[\n,]/)) {
    const tag = candidate.trim();
    if (!tag) continue;
    if (tag.length > 80) throw badRequest("Each tag must be 80 characters or fewer");
    const normalized = tag.toLocaleLowerCase("en");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(tag);
    if (tags.length > 12) throw badRequest("A listing can have at most 12 tags");
  }
  return tags;
}

function requiredMoneyCents(formData: FormData, key: string, label: string): number {
  const raw = requiredString(formData, key, { label });
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw badRequest(`${label} must be a positive amount with at most two decimal places`);
  }

  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw badRequest(`${label} must be greater than zero`);
  }
  if (cents > POSTGRES_INTEGER_MAX) {
    throw badRequest(`${label} exceeds the supported maximum`);
  }
  return cents;
}

function isAvailabilityMode(value: string): value is AdminListingItemInput["availabilityMode"] {
  return ["available_now", "preorder", "coming_soon", "unavailable"].includes(value);
}
