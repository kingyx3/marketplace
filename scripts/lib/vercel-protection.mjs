export function buildVercelProtectionHeaders(env = process.env) {
  const headers = new Headers({ Accept: "application/json" });
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypassSecret) headers.set("x-vercel-protection-bypass", bypassSecret);
  return headers;
}
