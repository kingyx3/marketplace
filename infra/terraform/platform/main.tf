locals {
  vercel_project_name           = var.vercel_project_name == "" ? var.project_slug : var.vercel_project_name
  staging_vercel_project_name   = "${local.vercel_project_name}-staging"
  vercel_team_id                = var.vercel_team_id == "" ? null : var.vercel_team_id
  vercel_root_directory         = var.vercel_root_directory == "" ? null : var.vercel_root_directory
  base_supabase_environments    = toset(["development", "production"])
  release_supabase_environments = var.enable_release_topology ? toset(["staging", "recovery"]) : toset([])
  active_supabase_environments  = setunion(local.base_supabase_environments, local.release_supabase_environments)
}

resource "random_password" "supabase_database" {
  for_each = local.active_supabase_environments

  length  = 32
  special = false
}

resource "vercel_project" "app" {
  name                                              = local.vercel_project_name
  framework                                         = "nextjs"
  install_command                                   = "npm ci"
  build_command                                     = "npm run build"
  root_directory                                    = local.vercel_root_directory
  team_id                                           = local.vercel_team_id
  preview_deployments_disabled                      = false
  automatically_expose_system_environment_variables = true
}

resource "vercel_project" "staging" {
  count = var.enable_release_topology ? 1 : 0

  name                                              = local.staging_vercel_project_name
  framework                                         = "nextjs"
  install_command                                   = "npm ci"
  build_command                                     = "npm run build"
  root_directory                                    = local.vercel_root_directory
  team_id                                           = local.vercel_team_id
  preview_deployments_disabled                      = true
  automatically_expose_system_environment_variables = true
}

resource "supabase_project" "app" {
  for_each = local.active_supabase_environments

  organization_id   = var.supabase_organization_id
  name              = "${var.project_slug}-${each.key}"
  database_password = random_password.supabase_database[each.key].result
  region            = var.supabase_region
}
