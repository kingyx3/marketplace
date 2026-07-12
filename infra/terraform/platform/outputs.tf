output "vercel_project_id" {
  description = "Primary Vercel project id retained for backward compatibility."
  value       = vercel_project.app.id
}

output "vercel_project_name" {
  description = "Primary Vercel project name retained for backward compatibility."
  value       = vercel_project.app.name
}

output "vercel_project_ids" {
  description = "Vercel project ids by deployable environment."
  value = merge(
    {
      development = vercel_project.app.id
      production  = vercel_project.app.id
    },
    { for project in vercel_project.staging : "staging" => project.id }
  )
}

output "vercel_project_names" {
  description = "Vercel project names by deployable environment."
  value = merge(
    {
      development = vercel_project.app.name
      production  = vercel_project.app.name
    },
    { for project in vercel_project.staging : "staging" => project.name }
  )
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

output "release_topology_enabled" {
  description = "Whether staging/recovery Supabase projects and the dedicated staging Vercel project are enabled."
  value       = var.enable_release_topology
}

output "project_slug" {
  description = "Stable project slug used to derive provider resource names."
  value       = var.project_slug
}
