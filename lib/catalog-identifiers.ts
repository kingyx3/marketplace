const COMBINING_MARKS = /[\u0300-\u036f]/g;
const APOSTROPHES = /['’]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_DELIMITERS = /^-+|-+$/g;

export function slugFromName(value: string, maxLength = 180): string {
  const normalized = value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .trim()
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(NON_ALPHANUMERIC, "-")
    .replace(EDGE_DELIMITERS, "");

  return normalized.slice(0, maxLength).replace(/-+$/g, "");
}

export function setCodeFromName(value: string): string {
  const code = slugFromName(value, 16).toUpperCase();
  if (code.length >= 2) return code;
  return code ? `${code}-1` : "";
}
