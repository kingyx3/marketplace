output "vercel_project_id" {
  description = "Single Vercel project id. Copy this into both active GitHub Environments as VERCEL_PROJECT_ID."
  value       = vercel_project.app.id
}

output "supabase_project_refs" {
  description = "Supabase project refs by environment. Copy each value into the matching GitHub Environment SUPABASE_PROJECT_REF variable."
  value       = { for env, project in supabase_project.app : env => project.id }
}

output "active_supabase_environments" {
  description = "Hosted Supabase environments managed by this Terraform stack."
  value       = sort(tolist(local.active_supabase_environments))
}
