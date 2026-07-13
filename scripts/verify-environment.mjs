#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { ENV_CONTRACT } from "./generate-env.mjs";
import {
  buildEnvironmentWithVercelFallback,
  fetchVercelEnvironmentRecords,
  genericVercelEnvironmentRecords,
  isUnreadableVercelEnvironmentRecord,
  resolveVercelProjectContext,
} from "./lib/vercel-environment.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

const targetEnv = process.env.TARGET_ENV;
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

  const vercelEnvironment = targetEnv === "development" ? "preview" : "production";
  const context = await resolveVercelProjectContext(process.env);
  const records = await fetchVercelEnvironmentRecords({
    ...context,
    target: vercelEnvironment,
    decrypt: true,
  });
  const recordsByKey = genericVercelEnvironmentRecords(records, vercelEnvironment);
  const runtimeKeys = ENV_CONTRACT.filter((entry) => !entry.deployOnly).map((entry) => entry.key);
  const verificationEnvironment = buildEnvironmentWithVercelFallback({
    records,
    runtimeKeys,
    baseEnv: process.env,
    target: vercelEnvironment,
  });
  if (isUnreadableVercelEnvironmentRecord(recordsByKey.get("STRIPE_WEBHOOK_SECRET"))) {
    delete verificationEnvironment.STRIPE_WEBHOOK_SECRET;
  }
  const siteUrl = verificationEnvironment.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl && !skipHealth) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required unless --skip-health is used");
  }
  process.env.MARKETPLACE_DISABLE_LOCAL_DOTENV = "true";

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

    run(process.execPath, ["scripts/configure-providers.mjs", "--verify"], {
      env: verificationEnvironment,
    });
    run(
      process.execPath,
      ["scripts/generate-env.mjs", "--write", runtimePath, "--allow-missing-provisioned"],
      { env: verificationEnvironment }
    );
    run(
      process.execPath,
      [
        "scripts/sync-vercel-env.mjs",
        runtimePath,
        "--check-only",
        "--preserve-unset-optional",
      ],
      { env: verificationEnvironment }
    );

    if (!skipHealth) {
      await checkHealth(new URL("/api/health", siteUrl));
      if (targetEnv !== "development") await checkHealth(new URL("/api/health?deep=1", siteUrl));
    }
    console.log(
      `Environment ${targetEnv} is release-ready: no Terraform or provider drift detected, the runtime contract is satisfied (unreadable values verified by presence), and health checks ${skipHealth ? "were skipped" : "passed"}.`
    );
  } finally {
    await Promise.all([rm(runtimePath, { force: true }), rm(planPath, { force: true })]);
  }
}

async function checkHealth(url) {
  const requestPath = `${url.pathname}${url.search}`;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = spawnSync(
      "npx",
      [
        "--yes",
        pinnedNpxPackage("vercel"),
        "curl",
        requestPath,
        "--deployment",
        url.origin,
        "--yes",
        "--token",
        process.env.VERCEL_TOKEN,
        "--",
        "--fail-with-body",
        "--silent",
        "--show-error",
        "--header",
        "Accept: application/json",
      ],
      { encoding: "utf8", env: process.env }
    );
    if (!result.error && result.status === 0) return;

    if (result.error) {
      lastError = new Error(`${requestPath} health check failed to start: ${result.error.message}`);
    } else {
      const output = [result.stderr, result.stdout]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join("\n");
      lastError = new Error(
        output
          ? `${requestPath} failed through vercel curl:\n${output}`
          : `${requestPath} failed through vercel curl with exit code ${result.status}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError || new Error(`Health check failed for ${url}`);
}

function run(command, args, options = {}) {
  const printable = [command, ...args]
    .map((value) => (value === process.env.VERCEL_TOKEN ? "[redacted-vercel-token]" : value))
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
