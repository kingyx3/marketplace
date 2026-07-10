terraform {
  required_version = "= 1.15.8"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "5.4.1"
    }

    supabase = {
      source  = "supabase/supabase"
      version = "1.9.1"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.9.0"
    }
  }
}
