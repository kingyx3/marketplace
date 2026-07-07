import { readFile } from "node:fs/promises";

const REQUIRED_SECURITY_HEADERS = new Map([
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)"],
  ["Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"],
]);

const REQUIRED_DEPLOY_ENV = ["APP_NAME", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "VERCEL_TOKEN"];

const RUNTIME_FROM_GITHUB_MARKERS = [
  "NEXT_PUBLIC_SUPABASE_URL: ${{ vars.",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ vars.",
  "NEXT_PUBLIC_SITE_URL: ${{ vars.",
  "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.",
  "STRIPE_SECRET_KEY: ${{ secrets.",
  "STRIPE_WEBHOOK_SECRET: ${{ secrets.",
  "RESEND_API_KEY: ${{ secrets.",
  "RESEND_FROM_EMAIL: ${{ vars.",
  "SUPPORT_EMAIL: ${{ vars.",
  "TWILIO_ACCOUNT_SID: ${{ vars.",
  "TWILIO_AUTH_TOKEN: ${{ secrets.",
  "TELEGRAM_BOT_TOKEN: ${{ secrets.",
  "WHATSAPP_ACCESS_TOKEN: ${{ secrets.",
  "WHATSAPP_PHONE_NUMBER_ID: ${{ vars.",
];

async function main() {
  const errors = [];
  const vercel = await readJson("vercel.json", errors);
  const deployWorkflow = await readText(".github/workflows/deploy.yml", errors);

  if (vercel) {
    if (vercel.framework !== "nextjs") errors.push("vercel.json must set framework=nextjs");
    if (vercel.installCommand !== "npm ci") errors.push("vercel.json must set installCommand=npm ci");
    if (vercel.buildCommand !== "npm run build") {
      errors.push("vercel.json must set buildCommand=npm run build");
    }
    const allHeaders = flattenHeaders(vercel.headers);
    for (const [key, value] of REQUIRED_SECURITY_HEADERS) {
      if (allHeaders.get(key) !== value) {
        errors.push(`vercel.json missing security header ${key}`);
      }
    }

    const apiHeaders = headersForSource(vercel.headers, "/api/(.*)");
    if (apiHeaders.get("Cache-Control") !== "no-store, max-age=0") {
      errors.push("vercel.json must set Cache-Control=no-store, max-age=0 for /api routes");
    }
  }

  if (deployWorkflow) {
    for (const key of REQUIRED_DEPLOY_ENV) {
      if (!deployWorkflow.includes(`${key}: \${{`)) {
        errors.push(`deploy workflow must map ${key} by name`);
      }
    }
    for (const marker of RUNTIME_FROM_GITHUB_MARKERS) {
      if (deployWorkflow.includes(marker)) {
        errors.push(`deploy workflow must not source runtime app env from GitHub: ${marker.split(":")[0]}`);
      }
    }
    if (!deployWorkflow.includes("Sync APP_NAME to Vercel")) {
      errors.push("deploy workflow must sync APP_NAME from GitHub vars to Vercel");
    }
    if (!deployWorkflow.includes("npx vercel pull")) {
      errors.push("deploy workflow must pull Vercel runtime env before deploy");
    }
    if (!deployWorkflow.includes("node scripts/generate-env.mjs --check")) {
      errors.push("deploy workflow must validate pulled runtime env before deploy");
    }
    if (deployWorkflow.includes(".env.deploy")) {
      errors.push("deploy workflow must not generate and sync the full runtime env from GitHub");
    }
    if (!deployWorkflow.includes("npx vercel deploy")) {
      errors.push("deploy workflow must deploy through Vercel CLI");
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
    for (const header of entry.headers ?? []) {
      headers.set(header.key, header.value);
    }
  }
  return headers;
}

function headersForSource(entries = [], source) {
  const entry = entries.find((candidate) => candidate.source === source);
  const headers = new Map();
  for (const header of entry?.headers ?? []) {
    headers.set(header.key, header.value);
  }
  return headers;
}

await main();
