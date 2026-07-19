"use client";

import { createBrowserClient } from "@supabase/ssr";

export interface BrowserSessionProvider {
  getAccessToken(): Promise<string | null>;
}

export function createBrowserSessionProvider(
  supabaseUrl: string,
  publishableKey: string
): BrowserSessionProvider {
  if (!supabaseUrl || !publishableKey) {
    return {
      async getAccessToken() {
        return null;
      },
    };
  }

  const client = createBrowserClient(supabaseUrl, publishableKey);

  return {
    async getAccessToken() {
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    },
  };
}
