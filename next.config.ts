import { withSentryConfig } from "@sentry/nextjs";
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

const canUploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: !process.env.CI,
  applicationKey: "marketplace-web",
  tunnelRoute: "/monitoring",
  sourcemaps: {
    disable: !canUploadSourceMaps,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  },
  webpack: {
    autoInstrumentAppDirectory: true,
    autoInstrumentMiddleware: true,
    autoInstrumentServerFunctions: true,
    automaticVercelMonitors: true,
    reactComponentAnnotation: { enabled: true },
    treeshake: { removeDebugLogging: true },
  },
});
