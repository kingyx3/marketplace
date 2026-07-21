export function previewFixturesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production" || env.TARGET_ENV === "production") {
    return false;
  }

  return env.NODE_ENV === "development" || env.MARKETPLACE_PREVIEW_FIXTURES === "true";
}
