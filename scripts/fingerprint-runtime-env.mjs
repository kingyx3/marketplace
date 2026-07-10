#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { ENV_CONTRACT } from "./generate-env.mjs";

const key = process.env.MARKETPLACE_ENV_FINGERPRINT_KEY;
if (!key) {
  console.error("MARKETPLACE_ENV_FINGERPRINT_KEY is required");
  process.exit(1);
}

const fingerprints = {};
for (const entry of ENV_CONTRACT) {
  if (entry.deployOnly) continue;
  const value = process.env[entry.key];
  if (value === undefined) continue;
  fingerprints[entry.key] = createHmac("sha256", key).update(value).digest("hex");
}

console.log(JSON.stringify(fingerprints));
