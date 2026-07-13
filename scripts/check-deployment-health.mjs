#!/usr/bin/env node
import { buildVercelProtectionHeaders } from "./lib/vercel-protection.mjs";

const args = process.argv.slice(2);
const deploymentUrl = args.find((value) => !value.startsWith("--"));
const deep = args.includes("--deep");

if (!deploymentUrl) {
  fail("Usage: node scripts/check-deployment-health.mjs <deployment-url> [--deep]");
}

let endpoint;
try {
  endpoint = new URL(deep ? "/api/health?deep=1" : "/api/health", deploymentUrl);
} catch {
  fail(`Invalid deployment URL: ${deploymentUrl}`);
}

try {
  await checkHealth(endpoint);
} catch (error) {
  fail(error?.message || String(error));
}

async function checkHealth(url) {
  const attempts = 5;
  let lastFailure = `Health check failed for ${url.origin}${url.pathname}${url.search}`;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: buildVercelProtectionHeaders(),
        redirect: "manual",
      });

      if (response.ok) {
        console.log(`${url.pathname}${url.search} returned HTTP ${response.status}.`);
        return;
      }

      lastFailure = describeFailure(url, response);
      console.error(`attempt ${attempt}: ${lastFailure}`);
    } catch (error) {
      lastFailure = `${url.pathname}${url.search} request failed: ${error?.message || String(error)}`;
      console.error(`attempt ${attempt}: ${lastFailure}`);
    }

    if (attempt < attempts) {
      const delaySeconds = attempt * 5;
      console.log(`retrying in ${delaySeconds}s`);
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  throw new Error(lastFailure);
}

function describeFailure(url, response) {
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const destination = safeRedirectDestination(location, url);
    const protectionHint = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
      ? "Verify that VERCEL_AUTOMATION_BYPASS_SECRET matches the Vercel project's Protection Bypass for Automation secret."
      : "Configure the environment-scoped VERCEL_AUTOMATION_BYPASS_SECRET GitHub secret from the Vercel project's Protection Bypass for Automation setting.";
    return `${url.pathname}${url.search} returned HTTP ${response.status}${destination}. Redirects are rejected so an authentication page cannot pass the smoke test. ${protectionHint}`;
  }

  return `${url.pathname}${url.search} returned HTTP ${response.status}`;
}

function safeRedirectDestination(location, baseUrl) {
  if (!location) return "";
  try {
    const destination = new URL(location, baseUrl);
    return ` to ${destination.origin}${destination.pathname}`;
  } catch {
    return "";
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
