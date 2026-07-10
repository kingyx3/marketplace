terraform {
  required_version = "= 1.15.8"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "= 4.8.0"
    }

    supabase = {
      source  = "supabase/supabase"
      version = "= 1.0.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "= 3.6.0"
    }
  }
}
