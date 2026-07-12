variable "project_slug" {
  description = "Stable project slug used to derive provider resource names."
  type        = string
  default     = "marketplace"
}

variable "vercel_team_id" {
  description = "Optional Vercel team id. Leave empty for personal accounts."
  type        = string
  default     = ""
}

variable "vercel_project_name" {
  description = "Optional Vercel project name override. Defaults to project_slug."
  type        = string
  default     = ""
}

variable "vercel_root_directory" {
  description = "Optional root directory for the Vercel project."
  type        = string
  default     = ""
}

variable "supabase_organization_id" {
  description = "Supabase organization slug/id from the dashboard."
  type        = string
}

variable "supabase_region" {
  description = "Region for active Supabase projects."
  type        = string
  default     = "ap-southeast-1"
}

variable "enable_release_topology" {
  description = "Opt in to staging/recovery Supabase projects and a dedicated staging Vercel project."
  type        = bool
  default     = false
}
