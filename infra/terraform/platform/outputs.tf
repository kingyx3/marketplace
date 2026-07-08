output "vercel_project_id" {
  description = "Single Vercel project id consumed by CI/CD as VERCEL_PROJECT_ID."
  value       = vercel_project.app.id
}

output "vercel_project_name" {
  description = "Vercel project name used by CI/CD as a fallback when resolving project metadata."
  value       = vercel_project.app.name
}

output "vercel_team_id" {
  description = "Configured Vercel team id when the project is team-owned. Empty for personal accounts."
  value       = var.vercel_team_id
}

output "supabase_project_refs" {
  description = "Supabase project refs by environment consumed by CI/CD as SUPABASE_PROJECT_REF."
  value       = { for env, project in supabase_project.app : env => project.id }
}

output "supabase_project_urls" {
  description = "Supabase API URLs by environment consumed by CI/CD as NEXT_PUBLIC_SUPABASE_URL."
  value       = { for env, project in supabase_project.app : env => "https://${project.id}.supabase.co" }
}

output "supabase_database_passwords" {
  description = "Terraform-generated Supabase database passwords by environment for same-job bootstrap and migration linking."
  value       = { for env, password in random_password.supabase_database : env => password.result }
  sensitive   = true
}

output "active_supabase_environments" {
  description = "Hosted Supabase environments managed by this Terraform stack."
  value       = sort(tolist(local.active_supabase_environments))
}

output "project_slug" {
  description = "Stable project slug used to derive provider resource names."
  value       = var.project_slug
}
