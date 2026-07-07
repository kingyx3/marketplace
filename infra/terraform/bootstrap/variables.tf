variable "gcp_project_id" {
  description = "Google Cloud project that owns the Terraform state bucket."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique GCS bucket name for Terraform state."
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
