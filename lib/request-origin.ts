export function getRequestOrigin(
  request: Request,
  canonicalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  vercelEnvironment = process.env.VERCEL_ENV,
  vercelUrl = process.env.VERCEL_URL
): string {
  const previewOrigin = parseVercelPreviewOrigin(vercelEnvironment, vercelUrl);
  if (previewOrigin) return previewOrigin;

  const canonicalOrigin = parseHttpOrigin(canonicalSiteUrl);

  // Hosted auth redirects must be anchored to a trusted deployment URL.
  // Production uses the configured canonical URL, while Vercel previews use
  // VERCEL_URL so PKCE cookies and the OAuth callback stay on the same host.
  if (canonicalOrigin && !isLoopbackHostname(new URL(canonicalOrigin).hostname)) {
    return canonicalOrigin;
  }

  const requestOrigin = getForwardedRequestOrigin(request);
  if (isLoopbackHostname(new URL(requestOrigin).hostname)) {
    return requestOrigin;
  }

  throw new Error("NEXT_PUBLIC_SITE_URL must be a valid hosted URL for auth redirects");
}

function getForwardedRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));

  if (!host) return requestUrl.origin;

  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol ?? requestUrl.protocol.slice(0, -1);

  if (protocol !== "http" && protocol !== "https") return requestUrl.origin;

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return requestUrl.origin;
  }
}

function parseVercelPreviewOrigin(
  vercelEnvironment: string | undefined,
  vercelUrl: string | undefined
): string | null {
  if (vercelEnvironment !== "preview" || !vercelUrl) return null;

  const value = /^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`;
  const origin = parseHttpOrigin(value);
  if (!origin) return null;

  const url = new URL(origin);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) return null;
  return origin;
}

function parseHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}
