import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  resolveVercelAccountSlug,
  resolveVercelPreviewRedirectPattern,
} from "../scripts/lib/vercel-preview-auth.mjs";

describe("Vercel preview OAuth redirects", () => {
  it("does not add preview redirects outside development", async () => {
    const fetchImpl = vi.fn();

    await expect(
      resolveVercelPreviewRedirectPattern(
        { TARGET_ENV: "production", VERCEL_TOKEN: "token" },
        fetchImpl
      )
    ).resolves.toBe("");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when development cannot resolve the Vercel account", async () => {
    await expect(
      resolveVercelPreviewRedirectPattern({ TARGET_ENV: "development" })
    ).rejects.toThrow("requires VERCEL_TOKEN or VERCEL_PREVIEW_ACCOUNT_SLUG");
  });

  it("uses an explicit account slug without an API request", async () => {
    const fetchImpl = vi.fn();

    await expect(
      resolveVercelPreviewRedirectPattern(
        {
          TARGET_ENV: "development",
          VERCEL_PREVIEW_ACCOUNT_SLUG: "KingYX3",
        },
        fetchImpl
      )
    ).resolves.toBe("https://*-kingyx3.vercel.app/auth/callback**");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves a team slug through the authenticated Vercel API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ slug: "marketplace-team" }), { status: 200 })
    );

    await expect(
      resolveVercelAccountSlug(
        {
          VERCEL_TOKEN: "token",
          VERCEL_TEAM_ID: "team_123",
        },
        fetchImpl
      )
    ).resolves.toBe("marketplace-team");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.vercel.com/v2/teams/team_123",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      })
    );
  });

  it("resolves a personal account username when no team is configured", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ user: { username: "kingyx3" } }), { status: 200 })
    );

    await expect(
      resolveVercelPreviewRedirectPattern(
        {
          TARGET_ENV: "development",
          VERCEL_TOKEN: "token",
        },
        fetchImpl
      )
    ).resolves.toBe("https://*-kingyx3.vercel.app/auth/callback**");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.vercel.com/v2/user",
      expect.any(Object)
    );
  });

  it("fails closed when the Vercel account lookup fails", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 })
    );

    await expect(
      resolveVercelAccountSlug({ VERCEL_TOKEN: "token" }, fetchImpl)
    ).rejects.toThrow("Vercel account lookup failed (403): forbidden");
  });

  it("rejects an unsafe account slug", async () => {
    await expect(
      resolveVercelAccountSlug({ VERCEL_PREVIEW_ACCOUNT_SLUG: "example.com/redirect" })
    ).rejects.toThrow("unsupported characters");
  });

  it("exposes Vercel system hostnames on every managed project", async () => {
    const terraform = await readFile(
      new URL("../infra/terraform/platform/main.tf", import.meta.url),
      "utf8"
    );

    expect(
      terraform.match(/automatically_expose_system_environment_variables = true/g)
    ).toHaveLength(2);
  });
});
