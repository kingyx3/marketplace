import { readFileSync } from "node:fs";

const versions = Object.freeze(
  JSON.parse(readFileSync(new URL("../config/tool-versions.json", import.meta.url), "utf8"))
);

export const TOOL_VERSIONS = versions;

export function pinnedNpxPackage(name) {
  const key = name === "vercel" ? "vercelCli" : name === "supabase" ? "supabaseCli" : "";
  if (!key || !versions[key]) throw new Error(`No pinned version is configured for ${name}`);
  return `${name}@${versions[key]}`;
}
