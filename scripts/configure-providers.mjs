#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const PROVIDERS = Object.freeze([
  ["Google OAuth", "scripts/configure-google-oauth.mjs"],
  ["Stripe", "scripts/configure-stripe.mjs"],
]);

const rawArgs = process.argv.slice(2);
const mode = rawArgs.includes("--apply")
  ? "--apply"
  : rawArgs.includes("--apply-if-configured")
    ? "--apply-if-configured"
    : rawArgs.includes("--verify")
      ? "--verify"
      : "--plan";
const passthroughArgs = rawArgs.filter((arg) => arg !== mode);

for (const [name, script] of PROVIDERS) {
  console.log(`\n==> ${name}: ${mode.slice(2)}`);
  const result = spawnSync(process.execPath, [script, mode, ...passthroughArgs], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`${name} provider configuration failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${name} provider configuration failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nProvider bootstrap configuration complete.");
