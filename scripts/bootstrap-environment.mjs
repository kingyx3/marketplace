#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { loadLocalDotenv } from "./generate-env.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

await loadLocalDotenv(process.env);
await applyVersionedEnvironmentConfig(process.env);

run(process.execPath, ["scripts/reconcile-runtime-environment.mjs", "--providers", "apply-if-configured"]);
if (!process.env.SUPABASE_PROJECT_REF) fail("SUPABASE_PROJECT_REF is required after environment resolution");
run("npx", ["--yes", pinnedNpxPackage("supabase"), "link", "--project-ref", process.env.SUPABASE_PROJECT_REF]);
run("npx", ["--yes", pinnedNpxPackage("supabase"), "db", "push"]);
console.log(`Environment ${process.env.TARGET_ENV} bootstrapped successfully.`);

function run(command, args) {
  const printable = [command, ...args].join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, { env: process.env, stdio: "inherit" });
  if (result.error) fail(`${printable} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${printable} failed with exit code ${result.status}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
