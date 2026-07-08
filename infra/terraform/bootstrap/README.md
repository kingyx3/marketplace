# Terraform state bootstrap

This stack creates the GCS bucket used by the platform Terraform backend.

It intentionally uses Terraform's default local state because the remote state
bucket does not exist until this stack runs. CI imports the bucket when it already
exists, so reruns can reconcile the bucket settings without committing local
state.

Required CI/CD inputs are `GCP_TERRAFORM_CREDENTIALS_JSON` and `GCP_PROJECT_ID`.
`PROJECT_SLUG`, `TF_STATE_BUCKET_NAME`, and `TF_STATE_BUCKET_LOCATION` are
optional; the workflow derives defaults when they are omitted. Do not commit real
state or tfvars files.
