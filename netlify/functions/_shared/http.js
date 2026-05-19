const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    ...baseHeaders,
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

export const fetchWithTimeout = async (url, options = {}, timeout = 20_000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const rawUrl = String(url ?? "");
    let safeUrl = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      parsed.search = "";
      safeUrl = parsed.toString();
    } catch {
      // ignore
    }

    const message = String(error?.message || error || "fetch failed");
    // Preserve original error as `cause` where supported.
    // (Node 18+ supports `cause`; older runtimes will ignore the second arg.)
    throw new Error(`fetch failed for ${safeUrl}: ${message}`, { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const readJsonBody = (event = {}) => JSON.parse(event.body || "{}");

export const PUBLIC_WEBSITE_URL = String(process.env.PUBLIC_WEBSITE_URL || "https://oneluxstay.com")
  .trim()
  .replace(/\/+$/, "");

const normalizeOrigin = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

// Internal origin for API/function routing.
// This must be environment-aware so Netlify Dev / Deploy Previews keep working.
export const getInternalOrigin = (event = {}) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "";
  const normalizedOrigin = normalizeOrigin(origin);
  if (normalizedOrigin) return normalizedOrigin;

  const referer = headers.referer || headers.referrer || headers.Referer || headers.Referrer || "";
  if (referer) {
    try {
      return new URL(String(referer)).origin.replace(/\/+$/, "");
    } catch {
      // ignore
    }
  }

  const proto =
    headers["x-forwarded-proto"] ||
    headers["X-Forwarded-Proto"] ||
    "https";
  const host = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return normalizeOrigin(
    process.env.INTERNAL_API_ORIGIN ||
      process.env.PUBLIC_SITE_URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.URL ||
      PUBLIC_WEBSITE_URL,
  ) || PUBLIC_WEBSITE_URL;
};

// Backwards-compatible alias used across functions (internal base).
export const getBaseUrl = (event = {}) => getInternalOrigin(event);

// Public website URL for guest-facing links.
export const getPublicWebsiteUrl = () => PUBLIC_WEBSITE_URL;

export const sanitizeInternalPath = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
};

export const withBookingSearchParams = (path = "/", { checkIn, checkOut, guests } = {}) => {
  const safePath = sanitizeInternalPath(path) || "/";
  let pathname = "/";
  let params = new URLSearchParams();

  try {
    const parsed = new URL(safePath, "https://oneluxstay.local");
    pathname = sanitizeInternalPath(parsed.pathname) || "/";
    params = new URLSearchParams(parsed.search || "");
  } catch {
    pathname = safePath;
  }

  if (checkIn) params.set("checkIn", String(checkIn));
  if (checkOut) params.set("checkOut", String(checkOut));
  if (Number.isFinite(Number(guests)) && Number(guests) > 0) {
    params.set("guests", String(Math.max(1, Math.round(Number(guests)))));
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
};

export const getHeaderValue = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  for (const [key, value] of Object.entries(event.multiValueHeaders || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

