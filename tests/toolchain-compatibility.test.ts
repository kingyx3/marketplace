import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

interface PackageManifest {
  devDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, { version?: string; devDependencies?: Record<string, string> }>;
}

describe("supported JavaScript toolchain", () => {
  it("pins the validated ESLint and TypeScript majors in the manifest and lockfile", async () => {
    const [manifestSource, lockSource] = await Promise.all([
      readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestSource) as PackageManifest;
    const lock = JSON.parse(lockSource) as PackageLock;
    const rootLock = lock.packages?.[""];

    expect(manifest.devDependencies?.eslint).toBe("9.39.2");
    expect(manifest.devDependencies?.typescript).toBe("5.9.3");
    expect(rootLock?.devDependencies?.eslint).toBe("9.39.2");
    expect(rootLock?.devDependencies?.typescript).toBe("5.9.3");
    expect(lock.packages?.["node_modules/eslint"]?.version).toBe("9.39.2");
    expect(lock.packages?.["node_modules/typescript"]?.version).toBe("5.9.3");
  });
});
