#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { withoutEmptyEnvironmentValues } from "./lib/process-environment.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const skipHealth = process.argv.includes("--skip-health");
const runtimePath = `.env.readiness-${process.pid}`;
const planPath = `infra/terraform/platform/.terraform-readiness-${process.pid}.tfplan`;

try {
  await main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exitCode = 1;
}

async function main() {
  if (!/^(development|staging|production)$/.test(targetEnv || "")) {
    throw new Error("TARGET_ENV must be development, staging, or production");
  }
  if (!token) throw new Error("VERCEL_TOKEN is required");
  if (!siteUrl && !skipHealth) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required unless --skip-health is used");
  }

  const vercelEnvironment = targetEnv === "development" ? "preview" : "production";
  const vercelEnvRunEnvironment = withoutEmptyEnvironmentValues(process.env);
  try {
    const plan = run(
      "terraform",
      [
        "-chdir=infra/terraform/platform",
        "plan",
        "-input=false",
        "-detailed-exitcode",
        `-out=.terraform-readiness-${process.pid}.tfplan`,
      ],
      { allowedStatuses: [0, 2] }
    );
    if (plan.status === 2) {
      throw new Error("Terraform drift detected. Reconcile and apply a reviewed exact plan before release.");
    }

    run("npx", [
      "--yes",
      pinnedNpxPackage("vercel"),
      "env",
      "run",
      "--environment",
      vercelEnvironment,
      "--token",
      token,
      "--",
      "node",
      "scripts/configure-providers.mjs",
      "--verify",
    ], { env: vercelEnvRunEnvironment });
    run("npx", [
      "--yes",
      pinnedNpxPackage("vercel"),
      "env",
      "run",
      "--environment",
      vercelEnvironment,
      "--token",
      token,
      "--",
      "node",
      "scripts/generate-env.mjs",
      "--write",
      runtimePath,
    ], { env: vercelEnvRunEnvironment });
    run(process.execPath, ["scripts/sync-vercel-env.mjs", runtimePath, "--check-only"]);

    if (!skipHealth) {
      await checkHealth(new URL("/api/health", siteUrl));
      if (targetEnv !== "development") await checkHealth(new URL("/api/health?deep=1", siteUrl));
    }
    console.log(
      `Environment ${targetEnv} is release-ready: no Terraform, provider, or runtime drift detected${skipHealth ? "" : ", and health checks passed"}.`
    );
  } finally {
    await Promise.all([rm(runtimePath, { force: true }), rm(planPath, { force: true })]);
  }
}

async function checkHealth(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (response.ok) return;
      lastError = new Error(`${url.pathname}${url.search} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError || new Error(`Health check failed for ${url}`);
}

function run(command, args, options = {}) {
  const printable = [command, ...args]
    .map((value) => (value === token ? "[redacted-vercel-token]" : value))
    .join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, { env: options.env || process.env, stdio: "inherit" });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  const allowedStatuses = options.allowedStatuses || [0];
  if (!allowedStatuses.includes(result.status ?? 1)) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
  return result;
}
