variable "vercel_team_id" {
  description = "Optional Vercel team id. Leave null for personal accounts."
  type        = string
  default     = null
}

variable "vercel_project_name" {
  description = "Single Vercel project used for preview development deploys and production deploys."
  type        = string
  default     = "marketplace"
}

variable "vercel_root_directory" {
  description = "Root directory for the Vercel project."
  type        = string
  default     = null
}

variable "supabase_organization_id" {
  description = "Supabase organization slug/id from the dashboard."
  type        = string
}

variable "supabase_environments" {
  description = "Active Supabase environments. Current setup uses development and production only."
  type = map(object({
    supabase_project_name  = string
    supabase_region        = string
    supabase_instance_size = optional(string, "micro")
  }))

  validation {
    condition     = alltrue([for env_name in keys(var.supabase_environments) : contains(["development", "production"], env_name)])
    error_message = "Only development and production are active hosted Supabase environments right now. Keep staging empty until a third project is available."
  }
}

variable "supabase_db_secret_by_environment" {
  description = "Per-environment database credential for Supabase project creation. Set through HCP Terraform sensitive variables or TF_VAR locally."
  type        = map(string)
  sensitive   = true
}
