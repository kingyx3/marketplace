locals {
  vercel_project_name          = var.vercel_project_name == "" ? var.project_slug : var.vercel_project_name
  vercel_team_id               = var.vercel_team_id == "" ? null : var.vercel_team_id
  vercel_root_directory        = var.vercel_root_directory == "" ? null : var.vercel_root_directory
  active_supabase_environments = toset(["development", "production"])
}

resource "random_password" "supabase_database" {
  for_each = local.active_supabase_environments

  length  = 32
  special = false
}

resource "vercel_project" "app" {
  name                         = local.vercel_project_name
  framework                    = "nextjs"
  install_command              = "npm ci"
  build_command                = "npm run build"
  root_directory               = local.vercel_root_directory
  team_id                      = local.vercel_team_id
  preview_deployments_disabled = false
}

resource "supabase_project" "app" {
  for_each = local.active_supabase_environments

  organization_id   = var.supabase_organization_id
  name              = "${var.project_slug}-${each.key}"
  database_password = random_password.supabase_database[each.key].result
  region            = var.supabase_region
  instance_size     = var.supabase_instance_size

  timeouts {
    create = "30m"
    update = "30m"
  }
}
