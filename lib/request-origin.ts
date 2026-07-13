export function getRequestOrigin(
  request: Request,
  canonicalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  vercelEnvironment = process.env.VERCEL_ENV,
  vercelUrl = process.env.VERCEL_URL,
  vercelBranchUrl = process.env.VERCEL_BRANCH_URL
): string {
  const previewOrigin = getVercelPreviewOrigin(
    request,
    vercelEnvironment,
    vercelUrl,
    vercelBranchUrl
  );
  if (previewOrigin) return previewOrigin;

  const canonicalOrigin = parseHttpOrigin(canonicalSiteUrl);

  // Hosted auth redirects must be anchored to a trusted deployment URL.
  // Production uses the configured canonical URL. Vercel previews preserve
  // the exact incoming deployment or branch host so the PKCE verifier cookie
  // and callback remain same-origin.
  if (canonicalOrigin && !isLoopbackHostname(new URL(canonicalOrigin).hostname)) {
    return canonicalOrigin;
  }

  const requestOrigin = getForwardedRequestOrigin(request);
  if (isLoopbackHostname(new URL(requestOrigin).hostname)) {
    return requestOrigin;
  }

  throw new Error("NEXT_PUBLIC_SITE_URL must be a valid hosted URL for auth redirects");
}

function getVercelPreviewOrigin(
  request: Request,
  vercelEnvironment: string | undefined,
  vercelUrl: string | undefined,
  vercelBranchUrl: string | undefined
): string | null {
  if (vercelEnvironment !== "preview") return null;

  const trustedOrigins = [vercelUrl, vercelBranchUrl]
    .map(parseVercelSystemOrigin)
    .filter((origin): origin is string => Boolean(origin));
  if (trustedOrigins.length === 0) return null;

  const trustedHostnames = new Set(
    trustedOrigins.map((origin) => new URL(origin).hostname)
  );
  const visibleOrigins = [getForwardedRequestOrigin(request), parseHttpOrigin(request.url)]
    .filter((origin): origin is string => Boolean(origin));

  for (const origin of visibleOrigins) {
    const url = new URL(origin);
    if (url.protocol === "https:" && trustedHostnames.has(url.hostname)) {
      return url.origin;
    }
  }

  // Some runtimes reconstruct request.url with an internal hostname. In that
  // case, fall back to the immutable deployment URL supplied by Vercel.
  return trustedOrigins[0];
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

function parseVercelSystemOrigin(value: string | undefined): string | null {
  if (!value) return null;

  const origin = parseHttpOrigin(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!origin) return null;

  const url = new URL(origin);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) return null;
  return url.origin;
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
