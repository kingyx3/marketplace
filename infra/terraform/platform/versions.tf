terraform {
  required_version = ">= 1.6.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = ">= 4.8.0"
    }

    supabase = {
      source  = "supabase/supabase"
      version = ">= 1.0.0"
    }
  }
}
