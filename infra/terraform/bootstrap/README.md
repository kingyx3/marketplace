# Terraform state bootstrap

This stack creates the GCS bucket used by the platform Terraform backend.

It intentionally uses Terraform's default local state because the remote state
bucket does not exist until this stack runs. CI imports the bucket when it already
exists, so reruns can reconcile the bucket settings without committing local
state.

Variables are passed by CI/CD through `TF_VAR_*` environment variables. Do not
commit real values.
