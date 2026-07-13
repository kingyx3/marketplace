import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Sentry observability contract", () => {
  it("initializes browser, server, edge, and request error instrumentation", async () => {
    const [client, server, edge, instrumentation, globalError] = await Promise.all([
      source("instrumentation-client.ts"),
      source("sentry.server.config.ts"),
      source("sentry.edge.config.ts"),
      source("instrumentation.ts"),
      source("app/global-error.tsx"),
    ]);

    for (const config of [client, server, edge]) {
      expect(config).toContain("Sentry.init");
      expect(config).toContain("sendDefaultPii: false");
      expect(config).toContain("scrubSentryEvent");
      expect(config).toContain("enableLogs: true");
    }
    expect(client).toContain("maskAllText: true");
    expect(client).toContain("maskAllInputs: true");
    expect(client).toContain("blockAllMedia: true");
    expect(client).toContain("captureRouterTransitionStart");
    expect(instrumentation).toContain("Sentry.captureRequestError");
    expect(globalError).toContain("Sentry.captureException(error)");
  });

  it("uploads source maps, tunnels browser events, and excludes the tunnel from middleware", async () => {
    const [nextConfig, middleware] = await Promise.all([source("next.config.ts"), source("middleware.ts")]);

    expect(nextConfig).toContain("withSentryConfig");
    expect(nextConfig).toContain("authToken: process.env.SENTRY_AUTH_TOKEN");
    expect(nextConfig).toContain('tunnelRoute: "/monitoring"');
    expect(nextConfig).toContain("widenClientFileUpload: true");
    expect(middleware).toContain("(?!monitoring|");
  });

  it("keeps production Sentry values environment-scoped and required", async () => {
    const contract = JSON.parse(await source("config/environment-contract.json")) as Array<{
      key: string;
      secret?: boolean;
      requiredWhen?: { key: string; equals: string };
    }>;
    const deployment = await source(".github/workflows/deploy.yml");
    const bootstrap = await source("scripts/bootstrap-github.mjs");

    for (const key of [
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      "SENTRY_ORG",
      "SENTRY_PROJECT",
      "SENTRY_AUTH_TOKEN",
    ]) {
      expect(contract.find((entry) => entry.key === key)?.requiredWhen).toEqual({
        key: "TARGET_ENV",
        equals: "production",
      });
      expect(deployment).toContain(key);
      expect(bootstrap).toContain(key);
    }
    expect(contract.find((entry) => entry.key === "SENTRY_AUTH_TOKEN")?.secret).toBe(true);
    expect(deployment).toContain("SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}");
  });

  it("bridges handled server errors and structured logs into privacy-safe Sentry events", async () => {
    const [observability, privacy] = await Promise.all([
      source("lib/observability.ts"),
      source("lib/sentry-config.ts"),
    ]);

    expect(observability).toContain("Sentry.captureException");
    expect(observability).toContain("Sentry.logger.error");
    expect(observability).toContain('["request_id", context.requestId]');
    expect(privacy).toContain("event.request.cookies = undefined");
    expect(privacy).toContain("event.request.data = undefined");
    expect(privacy).toContain("event.request.query_string = undefined");
    expect(privacy).toContain('event.user = event.user.id ? { id: String(event.user.id) } : undefined');
  });
});

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}
