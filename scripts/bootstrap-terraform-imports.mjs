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
  console.log(`Supabase import bootstrap can see ${projects.length} project(s): ${visibleSupabaseProjectNames(projects)}`);

  for (const env of supabaseEnvironments) {
    const address = `supabase_project.app[\"${env}\"]`;
    if (stateHas(address)) {
      console.log(`${address} is already in Terraform state; skipping Supabase import.`);
      continue;
    }

    const projectNames = supabaseProjectNameCandidates(projectSlug, env);
    const project = selectSupabaseProject(projects, projectNames, organizationId, env);
    if (!project) continue;
    const projectRef = project.id || project.ref;
    if (!projectRef) fail(`Supabase project ${supabaseProjectDisplayName(project)} response did not include an id/ref.`);

    console.log(`Importing existing Supabase project ${supabaseProjectDisplayName(project)} (${projectRef}) into Terraform state.`);
    terraform(["import", "-input=false", address, projectRef]);
  }
}

function selectSupabaseProject(projects, projectNames, organizationId, env) {
  const matches = projects.filter((candidate) => projectNames.includes(supabaseProjectDisplayName(candidate)));
  if (matches.length === 0) {
    const organizationProjects = projects.filter((candidate) => belongsToOrganization(candidate, organizationId));
    if (organizationProjects.length === 0) {
      console.log(`No existing Supabase project for ${env} in the configured organization; Terraform may create it.`);
      return null;
    }
    fail(`No existing Supabase project for ${env} matched ${projectNames.join(", ")}, but the organization already has project(s): ${visibleSupabaseProjectNames(organizationProjects)}. Set SUPABASE_${env.toUpperCase()}_PROJECT_NAME to import one of them, or remove it before letting Terraform create a new project.`);
  }

  const orgMatches = matches.filter((candidate) => belongsToOrganization(candidate, organizationId));
  if (orgMatches.length === 1) return orgMatches[0];
  if (orgMatches.length > 1) {
    fail(`Multiple Supabase projects for ${env} matched ${projectNames.join(", ")} in the configured organization. Set SUPABASE_${env.toUpperCase()}_PROJECT_NAME to disambiguate.`);
  }

  if (matches.length === 1) {
    console.log(`Supabase project ${supabaseProjectDisplayName(matches[0])} matched by name. Importing despite organization metadata mismatch or missing organization metadata.`);
    return matches[0];
  }

  fail(`Multiple Supabase projects for ${env} matched ${projectNames.join(", ")}, but none matched the configured organization metadata. Set SUPABASE_${env.toUpperCase()}_PROJECT_NAME to disambiguate.`);
}

function supabaseProjectNameCandidates(projectSlug, env) {
  return unique([
    firstPresent(`SUPABASE_${env.toUpperCase()}_PROJECT_NAME`, `SUPABASE_PROJECT_NAME_${env.toUpperCase()}`),
    env === "production" ? projectSlug : "",
    env === "development" ? `${projectSlug}-dev` : "",
    `${projectSlug}-${env}`,
  ]);
}

function supabaseProjectDisplayName(project) {
  return String(project.name || project.project_name || project.projectName || project.slug || "");
}

function visibleSupabaseProjectNames(projects) {
  const names = projects.map(supabaseProjectDisplayName).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "none with a name field";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

  return candidates.length > 0 && candidates.includes(organizationId);
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
