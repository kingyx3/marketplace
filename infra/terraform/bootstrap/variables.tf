variable "gcp_project_id" {
  description = "Google Cloud project that owns the Terraform state bucket. CI derives this from credentials when not set explicitly."
  type        = string
}

variable "project_slug" {
  description = "Stable project slug used to derive the default state bucket name."
  type        = string
  default     = "marketplace"
}

variable "state_bucket_name" {
  description = "Globally unique GCS bucket name for Terraform state. CI derives this from gcp_project_id and project_slug when not set explicitly."
  type        = string
}

variable "state_bucket_location" {
  description = "GCS bucket location. Use an Always Free-eligible US region when possible."
  type        = string
  default     = "us-central1"
}

variable "state_bucket_labels" {
  description = "Labels applied to the Terraform state bucket."
  type        = map(string)
  default = {
    app     = "marketplace"
    purpose = "terraform-state"
  }
}
