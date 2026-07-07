output "vercel_project_ids" {
  description = "Vercel project ids by environment. Copy these into the matching GitHub Environment VERCEL_PROJECT_ID variable."
  value       = { for env, project in vercel_project.app : env => project.id }
}

output "supabase_project_refs" {
  description = "Supabase project refs by environment. Copy these into the matching GitHub Environment SUPABASE_PROJECT_REF variable."
  value       = { for env, project in supabase_project.app : env => project.id }
}

output "active_environments" {
  description = "Hosted environments managed by this Terraform stack."
  value       = keys(local.active_environments)
}
