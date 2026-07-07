resource "google_storage_bucket" "terraform_state" {
  name                        = var.state_bucket_name
  location                    = var.state_bucket_location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.state_bucket_labels

  versioning {
    enabled = true
  }
}
