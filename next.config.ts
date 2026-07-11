import type { NextConfig } from "next";

const remotePatterns: Array<{
  protocol: "http" | "https";
  hostname: string;
  port: string;
  pathname: string;
}> = [];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  try {
    const storageOrigin = new URL(supabaseUrl);
    if (storageOrigin.protocol === "https:" || storageOrigin.protocol === "http:") {
      remotePatterns.push({
        protocol: storageOrigin.protocol.slice(0, -1) as "http" | "https",
        hostname: storageOrigin.hostname,
        port: storageOrigin.port,
        pathname: "/storage/v1/object/public/**",
      });
    }
  } catch {
    // Runtime environment validation reports malformed URLs with the full env contract.
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
};

export default nextConfig;
