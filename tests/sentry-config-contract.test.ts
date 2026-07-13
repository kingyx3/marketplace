import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const redundantEnvironmentKeys = [
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
  "SENTRY_RELEASE",
];

describe("minimal Sentry configuration contract", () => {
  it("uses one environment DSN plus shared source-map settings", async () => {
    const bootstrap = await read("scripts/bootstrap-github.mjs");

    expect(bootstrap).toContain('const sharedSentryVariables = ["SENTRY_ORG", "SENTRY_PROJECT"]');
    expect(bootstrap).toContain('const sharedSentrySecrets = ["SENTRY_AUTH_TOKEN"]');
    expect(bootstrap).toContain('"NEXT_PUBLIC_SENTRY_DSN"');
    expect(bootstrap).toContain('deleteEnvironmentSettingIfPresent("secret", target, "SENTRY_AUTH_TOKEN")');

    for (const key of redundantEnvironmentKeys) {
      expect(bootstrap).toContain(`"${key}"`);
    }
  });

  it("does not map redundant Sentry overrides into hosted workflows", async () => {
    for (const path of [
      ".github/workflows/bootstrap-environment.yml",
      ".github/workflows/deploy.yml",
    ]) {
      const workflow = await read(path);
      expect(workflow).toMatch(/^\s+NEXT_PUBLIC_SENTRY_DSN: \$\{\{ vars\.NEXT_PUBLIC_SENTRY_DSN \}\}$/m);
      expect(workflow).toMatch(/^\s+SENTRY_ORG: \$\{\{ vars\.SENTRY_ORG \}\}$/m);
      expect(workflow).toMatch(/^\s+SENTRY_PROJECT: \$\{\{ vars\.SENTRY_PROJECT \}\}$/m);
      expect(workflow).toMatch(/^\s+SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}$/m);

      for (const key of redundantEnvironmentKeys) {
        expect(workflow).not.toMatch(new RegExp(`^\\s+${key}:`, "m"));
      }
    }
  });
});
