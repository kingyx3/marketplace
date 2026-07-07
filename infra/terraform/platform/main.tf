locals {
  active_supabase_environments = var.supabase_environments
  vercel_team_id               = var.vercel_team_id == "" ? null : var.vercel_team_id
  vercel_root_directory        = var.vercel_root_directory == "" ? null : var.vercel_root_directory
}

resource "vercel_project" "app" {
  name                         = var.vercel_project_name
  framework                    = "nextjs"
  install_command             = "npm ci"
  build_command               = "npm run build"
  root_directory              = local.vercel_root_directory
  team_id                     = local.vercel_team_id
  preview_deployments_disabled = false
}

resource "supabase_project" "app" {
  for_each = local.active_supabase_environments

  organization_id         = var.supabase_organization_id
  name                    = each.value.supabase_project_name
  database_password       = var.supabase_db_secret_by_environment[each.key]
  region                  = each.value.supabase_region
  instance_size           = each.value.supabase_instance_size
  legacy_api_keys_enabled = false

  timeouts {
    create = "30m"
    update = "30m"
  }
}
