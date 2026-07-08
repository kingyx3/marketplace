#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { loadLocalDotenv } from "./generate-env.mjs";

await loadLocalDotenv(process.env);
const appliedConfig = await applyVersionedEnvironmentConfig(process.env);
if (appliedConfig.length > 0) {
  console.log(`resolved public environment config: ${appliedConfig.join(", ")}`);
}

try {
  run(process.execPath, ["scripts/configure-providers.mjs", "--apply-if-configured"]);
  run(process.execPath, ["scripts/generate-env.mjs", "--check"]);
  run(process.execPath, ["scripts/generate-env.mjs", "--write", ".env.deploy"]);
  run(process.execPath, ["scripts/sync-vercel-env.mjs", ".env.deploy"]);

  if (!process.env.SUPABASE_PROJECT_REF) fail("SUPABASE_PROJECT_REF is required after resolving public environment config");
  run("npx", ["supabase", "link", "--project-ref", process.env.SUPABASE_PROJECT_REF]);
  run("npx", ["supabase", "db", "push"]);
} finally {
  await rm(".env.deploy", { force: true });
}

function run(command, args) {
  const printable = [command, ...args].join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) fail(`${printable} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${printable} failed with exit code ${result.status}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
