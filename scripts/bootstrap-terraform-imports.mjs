#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const terraformDir = resolve(repoRoot, "infra/terraform/platform");
const supabaseEnvironments = (optional("TERRAFORM_BOOTSTRAP_SUPABASE_ENVIRONMENTS") || "development,production")
  .split(",")
  .map((env) => env.trim())
  .filter(Boolean);

await bootstrapVercelProject();
await bootstrapSupabaseProjects();

function optional(key) {
  return process.env[key]?.trim() || "";
}

function firstPresent(...keys) {
  for (const key of keys) {
    const value = optional(key);
    if (value) return value;
  }
  return "";
}

function stateHas(address) {
  const result = spawnSync("terraform", ["state", "show", "-no-color", address], {
    cwd: terraformDir,
    env: process.env,
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

function terraform(args) {
  const result = spawnSync("terraform", args, {
    cwd: terraformDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) fail(`Terraform failed to start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function bootstrapVercelProject() {
  const address = "vercel_project.app";
  if (stateHas(address)) {
    console.log(`${address} is already in Terraform state; skipping Vercel import.`);
    return;
  }

  const token = firstPresent("VERCEL_API_TOKEN", "VERCEL_TOKEN");
  if (!token) {
    console.log("VERCEL_API_TOKEN/VERCEL_TOKEN is not set; skipping Vercel import bootstrap.");
    return;
  }

  const projectName = firstPresent("TF_VAR_vercel_project_name", "VERCEL_PROJECT_NAME") || firstPresent("TF_VAR_project_slug", "PROJECT_SLUG");
  if (!projectName) {
    console.log("Project slug/name is not set; skipping Vercel import bootstrap.");
    return;
  }

  const teamId = firstPresent("TF_VAR_vercel_team_id", "VERCEL_TEAM_ID");
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const project = await fetchJson(url, {
    Authorization: `Bearer ${token}`,
  }, { optional404: true });

  if (!project) {
    console.log(`No existing Vercel project named ${projectName} was found; Terraform may create it.`);
    return;
  }

  const projectId = project.id || project.projectId;
  if (!projectId) fail(`Vercel project ${projectName} response did not include an id.`);

  console.log(`Importing existing Vercel project ${projectName} (${projectId}) into Terraform state.`);
  terraform(["import", "-input=false", address, projectId]);
}

async function bootstrapSupabaseProjects() {
  const token = optional("SUPABASE_ACCESS_TOKEN");
  if (!token) {
    console.log("SUPABASE_ACCESS_TOKEN is not set; skipping Supabase import bootstrap.");
    return;
  }

  const projectSlug = firstPresent("TF_VAR_project_slug", "PROJECT_SLUG");
  if (!projectSlug) {
    console.log("Project slug is not set; skipping Supabase import bootstrap.");
    return;
  }

  const organizationId = firstPresent("TF_VAR_supabase_organization_id", "SUPABASE_ORGANIZATION_ID");
  const projects = await fetchJson("https://api.supabase.com/v1/projects", {
    Authorization: `Bearer ${token}`,
  });

  if (!Array.isArray(projects)) fail("Unexpected Supabase projects response.");

  for (const env of supabaseEnvironments) {
    const address = `supabase_project.app[\"${env}\"]`;
    if (stateHas(address)) {
      console.log(`${address} is already in Terraform state; skipping Supabase import.`);
      continue;
    }

    const projectName = `${projectSlug}-${env}`;
    const project = projects.find((candidate) => candidate.name === projectName && belongsToOrganization(candidate, organizationId));
    if (!project) {
      console.log(`No existing Supabase project named ${projectName} was found; Terraform may create it.`);
      continue;
    }

    const projectRef = project.id || project.ref;
    if (!projectRef) fail(`Supabase project ${projectName} response did not include an id/ref.`);

    console.log(`Importing existing Supabase project ${projectName} (${projectRef}) into Terraform state.`);
    terraform(["import", "-input=false", address, projectRef]);
  }
}

function belongsToOrganization(project, organizationId) {
  if (!organizationId) return true;

  const candidates = [
    project.organization_id,
    project.organizationId,
    project.organization?.id,
    project.organization?.slug,
  ]
    .filter(Boolean)
    .map(String);

  return candidates.length === 0 || candidates.includes(organizationId);
}

async function fetchJson(url, headers, options = {}) {
  const response = await fetch(url, { headers });
  if (response.status === 404 && options.optional404) return null;

  if (!response.ok) {
    const body = await response.text();
    fail(`Request to ${url} failed with HTTP ${response.status}: ${body}`);
  }

  return response.json();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
