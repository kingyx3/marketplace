import { readFile } from "node:fs/promises";

const REQUIRED_SECURITY_HEADERS = new Map([
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)"],
  ["Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"],
]);

const REQUIRED_WORKFLOW_MARKERS = [
  "NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}",
  "SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}",
  "STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}",
  "STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}",
  "NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}",
  "APP_NAME: ${{ vars.APP_NAME }}",
  "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
  "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
  "SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}",
  "VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}",
  "VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}",
  "VERCEL_PROJECT_ID: ${{ vars.VERCEL_PROJECT_ID }}",
  "Generate runtime env from GitHub",
  "node scripts/generate-env.mjs --write .env.deploy",
  "Sync runtime env to Vercel",
  "node scripts/sync-vercel-env.mjs .env.deploy",
];

async function main() {
  const errors = [];
  const vercel = await readJson("vercel.json", errors);
  const deployWorkflow = await readText(".github/workflows/deploy.yml", errors);
  const syncScript = await readText("scripts/sync-vercel-env.mjs", errors);
  const bootstrapWorkflow = await readText(".github/workflows/bootstrap-environment.yml", errors);

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

  if (deployWorkflow) {
    for (const marker of REQUIRED_WORKFLOW_MARKERS) {
      if (!deployWorkflow.includes(marker)) errors.push(`deploy workflow missing required marker: ${marker}`);
    }
    if (deployWorkflow.includes("npx vercel pull")) {
      errors.push("deploy workflow must not pull Vercel env as the runtime source of truth");
    }
    if (!deployWorkflow.includes("npx vercel deploy")) {
      errors.push("deploy workflow must deploy through Vercel CLI");
    }
  }

  if (syncScript) {
    if (!syncScript.includes('targetEnv === "production" ? "production" : "preview"')) {
      errors.push("sync script must map development to preview and production to production");
    }
  }

  if (bootstrapWorkflow) {
    if (bootstrapWorkflow.includes("uses: ./.github/workflows/deploy.yml")) {
      errors.push("bootstrap workflow must stay separate from regular deploy workflow");
    }
    if (bootstrapWorkflow.includes("npx vercel deploy")) {
      errors.push("bootstrap workflow must not deploy the app");
    }
  }

  if (errors.length > 0) {
    console.error("Vercel config validation FAILED:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log("Vercel config validation OK");
}

async function readJson(path, errors) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    errors.push(`${path} is missing or invalid JSON: ${error.message}`);
    return null;
  }
}

async function readText(path, errors) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    errors.push(`${path} is missing: ${error.message}`);
    return "";
  }
}

function flattenHeaders(entries = []) {
  const headers = new Map();
  for (const entry of entries) {
    for (const header of entry.headers ?? []) headers.set(header.key, header.value);
  }
  return headers;
}

function headersForSource(entries = [], source) {
  const entry = entries.find((candidate) => candidate.source === source);
  const headers = new Map();
  for (const header of entry?.headers ?? []) headers.set(header.key, header.value);
  return headers;
}

await main();
