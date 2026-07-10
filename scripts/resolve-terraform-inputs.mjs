#!/usr/bin/env node
import { appendFile } from "node:fs/promises";
import { basename } from "node:path";

const mode = process.argv[2];
const githubEnv = process.env.GITHUB_ENV;

if (!githubEnv) fail("GITHUB_ENV is required");
if (!mode || !["state", "platform"].includes(mode)) fail("Usage: resolve-terraform-inputs.mjs <state|platform>");

const googleCredentials = required("GCP_TERRAFORM_CREDENTIALS_JSON");
const gcpProjectId = optional("GCP_PROJECT_ID") || readGoogleProjectId(googleCredentials);
if (!gcpProjectId) fail("Set GCP_PROJECT_ID or provide Google credential JSON with project_id");

const projectSlug = slugify(optional("PROJECT_SLUG") || basename(required("GITHUB_REPOSITORY")));
const stateBucketName = optional("TF_STATE_BUCKET_NAME") || bucketName(gcpProjectId, projectSlug);
const stateBucketLocation = optional("TF_STATE_BUCKET_LOCATION") || "us-central1";

const values = {
  GOOGLE_CREDENTIALS: googleCredentials,
  TF_VAR_gcp_project_id: gcpProjectId,
  TF_VAR_project_slug: projectSlug,
  TF_VAR_state_bucket_name: stateBucketName,
  TF_VAR_state_bucket_location: stateBucketLocation,
};

if (mode === "platform") {
  const vercelToken = optional("VERCEL_API_TOKEN") || required("VERCEL_TOKEN");
  required("SUPABASE_ACCESS_TOKEN");

  values.VERCEL_API_TOKEN = vercelToken;
  values.TF_STATE_BUCKET_NAME = stateBucketName;
  values.TF_STATE_PREFIX = "marketplace/platform";
  values.TF_VAR_vercel_team_id = optional("VERCEL_TEAM_ID");
  values.TF_VAR_vercel_project_name = optional("VERCEL_PROJECT_NAME");
  values.TF_VAR_vercel_root_directory = optional("VERCEL_ROOT_DIRECTORY");
  values.TF_VAR_supabase_organization_id = optional("SUPABASE_ORGANIZATION_ID") || await resolveSingleSupabaseOrganizationId();
  values.TF_VAR_supabase_region = optional("SUPABASE_REGION") || "ap-southeast-1";
}

await appendFile(githubEnv, Object.entries(values).map(([key, value]) => formatGithubEnvLine(key, value)).join(""), "utf8");

function optional(key) {
  return process.env[key]?.trim() || "";
}

function required(key) {
  const value = optional(key);
  if (!value) fail(`${key} is required`);
  return value;
}

function readGoogleProjectId(raw) {
  try {
    return JSON.parse(raw).project_id || "";
  } catch {
    return "";
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "marketplace";
}

function bucketName(projectId, slug) {
  return `${projectId}-${slug}-tfstate`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function formatGithubEnvLine(key, value) {
  const stringValue = String(value ?? "");
  if (!stringValue.includes("\n")) return `${key}=${stringValue}\n`;
  const delimiter = `EOF_${key}_${Date.now()}`;
  return `${key}<<${delimiter}\n${stringValue}\n${delimiter}\n`;
}

async function resolveSingleSupabaseOrganizationId() {
  const token = required("SUPABASE_ACCESS_TOKEN");
  const response = await fetch("https://api.supabase.com/v1/organizations", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) fail(`Could not list Supabase organizations: HTTP ${response.status}`);
  const organizations = await response.json();
  if (!Array.isArray(organizations)) fail("Unexpected Supabase organizations response");
  if (organizations.length !== 1) fail("Set SUPABASE_ORGANIZATION_ID when the Supabase token can access zero or multiple organizations");
  return organizations[0].id || organizations[0].slug || fail("Supabase organization response did not include an id or slug");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
