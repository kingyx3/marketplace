const VERCEL_ACCOUNT_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export async function resolveVercelPreviewRedirectPattern(env = process.env, fetchImpl = fetch) {
  if (env.TARGET_ENV !== "development") return "";

  const accountSlug = await resolveVercelAccountSlug(env, fetchImpl);
  return accountSlug ? `https://*-${accountSlug}.vercel.app/auth/callback**` : "";
}

export async function resolveVercelAccountSlug(env = process.env, fetchImpl = fetch) {
  const explicitSlug = normalizeAccountSlug(env.VERCEL_PREVIEW_ACCOUNT_SLUG);
  if (explicitSlug) return explicitSlug;

  const token = env.VERCEL_TOKEN || env.VERCEL_API_TOKEN || "";
  if (!token) return "";

  const teamId = env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || "";
  const url = teamId.startsWith("team_")
    ? `https://api.vercel.com/v2/teams/${encodeURIComponent(teamId)}`
    : "https://api.vercel.com/v2/user";
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText || "request failed";
    throw new Error(`Vercel account lookup failed (${response.status}): ${message}`);
  }

  const accountSlug = teamId.startsWith("team_")
    ? payload?.slug
    : payload?.user?.username ?? payload?.username;
  return normalizeAccountSlug(accountSlug, { required: true });
}

function normalizeAccountSlug(value, { required = false } = {}) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug) {
    if (required) throw new Error("Vercel account lookup did not return a username or team slug");
    return "";
  }
  if (!VERCEL_ACCOUNT_SLUG.test(slug)) {
    throw new Error("Vercel preview account slug contains unsupported characters");
  }
  return slug;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Vercel account lookup returned malformed JSON");
  }
}
