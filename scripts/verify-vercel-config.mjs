import { readFile } from "node:fs/promises";

const REQUIRED_SECURITY_HEADERS = new Map([
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)"],
  ["Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"],
]);

async function main() {
  const errors = [];
  const vercel = await readJson("vercel.json", errors);
  const deployWorkflow = await readText(".github/workflows/deploy.yml", errors);
  const bootstrapWorkflow = await readText(".github/workflows/bootstrap-environment.yml", errors);
  const runtimeReconciler = await readText("scripts/reconcile-runtime-environment.mjs", errors);
  const syncScript = await readText("scripts/sync-vercel-env.mjs", errors);
  const deployScript = await readText("scripts/deploy-vercel.mjs", errors);
  const toolVersions = await readJson("config/tool-versions.json", errors);

  if (vercel) {
    if (vercel.framework !== "nextjs") errors.push("vercel.json must set framework=nextjs");
    if (vercel.installCommand !== "npm ci") errors.push("vercel.json must set installCommand=npm ci");
    if (vercel.buildCommand !== "npm run build") errors.push("vercel.json must set buildCommand=npm run build");
    const allHeaders = flattenHeaders(vercel.headers);
    for (const [key, value] of REQUIRED_SECURITY_HEADERS) {
      if (allHeaders.get(key) !== value) errors.push(`vercel.json missing security header ${key}`);
    }
    const apiHeaders = headersForSource(vercel.headers, "/api/(.*)");
    if (apiHeaders.get("Cache-Control") !== "no-store, max-age=0") {
      errors.push("vercel.json must set Cache-Control=no-store, max-age=0 for /api routes");
    }
  }

  for (const marker of [
    "env: &resolved_environment",
    "TARGET_ENV: ${{ inputs.environment }}",
    "GOOGLE_AUTH_ENABLED: ${{ vars.GOOGLE_AUTH_ENABLED }}",
    "node scripts/resolve-environment.mjs",
    "node scripts/generate-env.mjs --check --allow-missing-provisioned",
    "node scripts/reconcile-runtime-environment.mjs --providers apply-if-configured",
    "node scripts/deploy-vercel.mjs",
  ]) {
    if (!deployWorkflow.includes(marker)) errors.push(`deploy workflow missing required marker: ${marker}`);
  }
  for (const marker of [
    "vars.NEXT_PUBLIC_SUPABASE_URL",
    "vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "vars.SUPABASE_PROJECT_REF",
    "npx vercel pull",
    "Generate runtime env from resolved config",
  ]) {
    if (deployWorkflow.includes(marker)) errors.push(`deploy workflow contains deprecated marker: ${marker}`);
  }

  if (!runtimeReconciler.includes("provision-stripe-webhook.mjs") || !runtimeReconciler.includes("sync-vercel-env.mjs")) {
    errors.push("runtime reconciler must own Stripe provisioning and Vercel environment sync");
  }
  for (const marker of [
    "fetchVercelEnvironmentRecords",
    "createVercelEnvironmentRecord",
    "updateVercelEnvironmentRecord",
    'type: "encrypted"',
  ]) {
    if (!syncScript.includes(marker)) errors.push(`Vercel env sync missing authoritative API marker: ${marker}`);
  }
  if (syncScript.includes('pinnedNpxPackage("vercel")') || syncScript.includes('"env", "run"')) {
    errors.push("Vercel env sync must not use CLI-based mutation or readback");
  }
  if (!deployScript.includes('pinnedNpxPackage("vercel")')) errors.push("Vercel deployment must use the pinned CLI");
  if (!toolVersions?.vercelCli) errors.push("config/tool-versions.json must pin vercelCli");

  if (bootstrapWorkflow.includes("uses: ./.github/workflows/deploy.yml")) {
    errors.push("bootstrap workflow must stay separate from regular deployment");
  }
  if (!bootstrapWorkflow.includes("node scripts/bootstrap-environment.mjs")) {
    errors.push("bootstrap workflow must delegate to the codified bootstrap script");
  }

  if (errors.length > 0) {
    console.error("Vercel config validation FAILED:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log("Vercel config validation OK");
}

async function readJson(path, errors) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { errors.push(`${path} is missing or invalid JSON: ${error.message}`); return null; }
}
async function readText(path, errors) {
  try { return await readFile(path, "utf8"); }
  catch (error) { errors.push(`${path} is missing: ${error.message}`); return ""; }
}
function flattenHeaders(entries = []) {
  const headers = new Map();
  for (const entry of entries) for (const header of entry.headers ?? []) headers.set(header.key, header.value);
  return headers;
}
function headersForSource(entries = [], source) {
  const entry = entries.find((candidate) => candidate.source === source);
  return new Map((entry?.headers ?? []).map((header) => [header.key, header.value]));
}
await main();
