terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.40.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
}
