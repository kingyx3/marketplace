const LOCAL_FALLBACK_APP_NAME = "Store";

export function getAppName(env: Record<string, string | undefined> = process.env): string {
  const appName = env.APP_NAME?.trim();
  return appName || LOCAL_FALLBACK_APP_NAME;
}
