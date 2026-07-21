export function validateAdminFormRelationships(data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};

  validateDateOrder(data, errors, "startsAt", "endsAt", "End time must be after the start time.");
  validateDateOrder(
    data,
    errors,
    "orderOpenAt",
    "orderCloseAt",
    "Orders must close after they open."
  );
  validateDateOrder(
    data,
    errors,
    "preorderOpenAt",
    "preorderCloseAt",
    "Preorders must close after they open."
  );

  const price = optionalNumber(data.get("priceCents"));
  const compareAt = optionalNumber(data.get("compareAtCents"));
  if (price !== null && compareAt !== null && compareAt <= price) {
    errors.compareAtCents = "Compare-at cents must be greater than the selling price.";
  }

  const dealPriceCents = optionalMoneyCents(data.get("dealPrice"));
  const originalPriceCents = optionalNumber(data.get("originalPriceCents"));
  if (
    dealPriceCents !== null &&
    originalPriceCents !== null &&
    dealPriceCents >= originalPriceCents
  ) {
    errors.dealPrice = "Deal price must be lower than the original price.";
  }

  const valueJson = stringValue(data.get("valueJson"));
  if (valueJson) {
    try {
      const parsed = JSON.parse(valueJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.valueJson = "JSON value must be an object.";
      }
    } catch {
      errors.valueJson = "Enter valid JSON before saving.";
    }
  }

  const tags = stringValue(data.get("tags"));
  if (tags && tags.split(",").filter((tag) => tag.trim()).length > 12) {
    errors.tags = "A listing can have at most 12 tags.";
  }

  return errors;
}

function validateDateOrder(
  data: FormData,
  errors: Record<string, string>,
  startName: string,
  endName: string,
  message: string
) {
  const start = stringValue(data.get(startName));
  const end = stringValue(data.get(endName));
  if (!start || !end) return;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime <= startTime) {
    errors[endName] = message;
  }
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const input = stringValue(value);
  if (!input) return null;
  const number = Number(input);
  return Number.isFinite(number) ? number : null;
}

function optionalMoneyCents(value: FormDataEntryValue | null): number | null {
  const input = stringValue(value);
  if (!input || !/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
