const DEFAULT_APP_NAME = "Marketplace";

export function getAppName(env: Record<string, string | undefined> = process.env): string {
  const appName = env.APP_NAME?.trim();
  return appName || DEFAULT_APP_NAME;
}
