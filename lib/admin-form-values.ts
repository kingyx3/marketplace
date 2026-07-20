import { badRequest } from "@/lib/api/errors";

export const POSTGRES_INTEGER_MAX = 2_147_483_647;
export const MAX_ADMIN_JSON_CHARACTERS = 32_768;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requiredString(
  formData: FormData,
  key: string,
  options: { min?: number; max?: number; label?: string } = {}
): string {
  const value = optionalString(formData, key, options);
  const label = options.label ?? key;
  if (!value) throw badRequest(`${label} is required`);
  if (options.min && value.length < options.min) {
    throw badRequest(`${label} must be at least ${options.min} characters`);
  }
  return value;
}

export function optionalString(
  formData: FormData,
  key: string,
  options: { max?: number; label?: string } = {}
): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (options.max && value.length > options.max) {
    throw badRequest(`${options.label ?? key} must be ${options.max} characters or fewer`);
  }
  return value;
}

export function requiredUuid(formData: FormData, key: string, label = key): string {
  const value = requiredString(formData, key, { label });
  if (!UUID_PATTERN.test(value)) throw badRequest(`${label} must be a valid UUID`);
  return value;
}

export function optionalUuid(formData: FormData, key: string, label = key): string | null {
  const value = optionalString(formData, key);
  if (!value) return null;
  if (!UUID_PATTERN.test(value)) throw badRequest(`${label} must be a valid UUID`);
  return value;
}

export function requiredInteger(
  formData: FormData,
  key: string,
  options: { min?: number; max?: number; label?: string } = {}
): number {
  const label = options.label ?? key;
  const raw = requiredString(formData, key, { label });
  if (!/^-?\d+$/.test(raw)) throw badRequest(`${label} must be an integer`);
  const value = Number(raw);
  if (!Number.isInteger(value)) throw badRequest(`${label} must be an integer`);
  if (options.min !== undefined && value < options.min) {
    const qualifier = options.min === 0 ? "non-negative" : `at least ${options.min}`;
    throw badRequest(`${label} must be ${qualifier}`);
  }
  const max = options.max ?? POSTGRES_INTEGER_MAX;
  if (value > max) throw badRequest(`${label} exceeds the supported maximum of ${max}`);
  return value;
}

export function optionalInteger(
  formData: FormData,
  key: string,
  options: { min?: number; max?: number; label?: string } = {}
): number | null {
  const raw = optionalString(formData, key);
  if (!raw) return null;
  const label = options.label ?? key;
  if (!/^-?\d+$/.test(raw)) throw badRequest(`${label} must be an integer`);
  const value = Number(raw);
  if (!Number.isInteger(value)) throw badRequest(`${label} must be an integer`);
  if (options.min !== undefined && value < options.min) {
    const qualifier = options.min === 0 ? "non-negative" : `at least ${options.min}`;
    throw badRequest(`${label} must be ${qualifier}`);
  }
  const max = options.max ?? POSTGRES_INTEGER_MAX;
  if (value > max) throw badRequest(`${label} exceeds the supported maximum of ${max}`);
  return value;
}

export function booleanField(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  if (values.length === 0) return defaultValue;
  return values.some((value) => value === "true" || value === "on");
}

export function requiredBoolean(formData: FormData, key: string): boolean {
  const value = requiredString(formData, key);
  if (value !== "true" && value !== "false") {
    throw badRequest(`${key} must be true or false`);
  }
  return value === "true";
}

export function requiredCurrency(formData: FormData, key = "currency"): string {
  const value = requiredString(formData, key).toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw badRequest(`${key} must be a 3-letter currency code`);
  return value;
}

export function optionalIsoDate(formData: FormData, key: string): string | null {
  const value = optionalString(formData, key);
  if (!value) return null;
  if (!isExactIsoDate(value)) throw badRequest(`${key} must be a valid date using YYYY-MM-DD`);
  return value;
}

export function requiredSingaporeDateTime(formData: FormData, key: string): string {
  const value = requiredString(formData, key);
  return singaporeDateTimeToIso(value, key);
}

export function optionalSingaporeDateTime(formData: FormData, key: string): string | null {
  const value = optionalString(formData, key);
  return value ? singaporeDateTimeToIso(value, key) : null;
}

export function assertHttpUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest(`${label} must use http or https`);
  }
}

export function isExactIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year] = match;
  if (year === "0000") return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function singaporeDateTimeToIso(value: string, key: string): string {
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (local) {
    const [, year, month, day, hour, minute, second = "00"] = local;
    if (
      !isExactIsoDate(`${year}-${month}-${day}`) ||
      Number(hour) > 23 ||
      Number(minute) > 59 ||
      Number(second) > 59
    ) {
      throw badRequest(`${key} must be a valid Singapore date and time`);
    }
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`).toISOString();
  }

  throw badRequest(`${key} must be a valid Singapore date and time`);
}
