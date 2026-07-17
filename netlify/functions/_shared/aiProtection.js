const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://oneluxstay.com",
  "https://www.oneluxstay.com",
  "https://admin.oneluxstay.com",
  "https://oneluxstay.netlify.app",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:8888",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:8888",
];

const RATE_BUCKETS = new Map();
const MAX_RATE_BUCKETS = 5000;

const DEFAULT_BLOCKED_UA_REGEX =
  /(bot|crawler|spider|curl|wget|python-requests|postmanruntime|insomnia|node-fetch|axios|go-http-client|libwww-perl)/i;

const parseBoolean = (value, defaultValue = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getHeader = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();
  const headers = event?.headers || {};

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  return "";
};

const normalizeOrigin = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return "";
  }
};

const parseAllowedOrigins = (value = "") =>
  String(value || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const getAllowedOrigins = () => {
  const configured = parseAllowedOrigins(getEnv("AI_ALLOWED_ORIGINS"));
  const includeDefaults = parseBoolean(getEnv("AI_INCLUDE_DEFAULT_ALLOWED_ORIGINS"), true);
  const publicSite = normalizeOrigin(
    getEnv("PUBLIC_SITE_URL") ||
      getEnv("DEPLOY_PRIME_URL") ||
      getEnv("URL") ||
      getEnv("DEPLOY_URL"),
  );

  return unique([
    ...(includeDefaults ? DEFAULT_ALLOWED_ORIGINS : []),
    ...configured,
    publicSite,
  ]);
};

const getRequestOrigin = (event = {}) => {
  const origin = normalizeOrigin(getHeader(event, "origin"));
  if (origin) return origin;

  const referer = getHeader(event, "referer") || getHeader(event, "referrer");
  if (!referer) return "";

  return normalizeOrigin(referer);
};

const getClientIp = (event = {}) => {
  const direct =
    getHeader(event, "x-nf-client-connection-ip") ||
    getHeader(event, "x-forwarded-for") ||
    getHeader(event, "x-real-ip") ||
    getHeader(event, "client-ip");

  if (!direct) return "unknown";
  return String(direct).split(",")[0].trim() || "unknown";
};

const pruneRateBuckets = (now) => {
  if (RATE_BUCKETS.size <= MAX_RATE_BUCKETS) return;

  for (const [key, bucket] of RATE_BUCKETS.entries()) {
    if (bucket.resetAt <= now) {
      RATE_BUCKETS.delete(key);
    }
    if (RATE_BUCKETS.size <= MAX_RATE_BUCKETS) break;
  }
};

const consumeRateLimit = ({ key, maxRequests, windowMs }) => {
  const now = Date.now();
  pruneRateBuckets(now);

  const existing = RATE_BUCKETS.get(key);
  if (!existing || existing.resetAt <= now) {
    RATE_BUCKETS.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  RATE_BUCKETS.set(key, existing);
  return { ok: true, retryAfter: 0 };
};

export const buildAiCorsHeaders = (event = {}) => {
  const requestOrigin = normalizeOrigin(getHeader(event, "origin"));
  const allowedOrigins = getAllowedOrigins();
  const allowAnyOrigin = parseBoolean(getEnv("AI_ALLOW_ANY_ORIGIN"), false);
  const allowOrigin =
    allowAnyOrigin || !allowedOrigins.length
      ? "*"
      : requestOrigin && allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : allowedOrigins[0];

  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      getHeader(event, "access-control-request-headers") ||
      "Content-Type, Authorization, Accept, Origin, X-Requested-With",
    Vary: "Origin",
  };
};

export const verifyAiRequest = (event = {}, { endpoint = "ai" } = {}) => {
  const requestOrigin = getRequestOrigin(event);
  const allowedOrigins = getAllowedOrigins();
  const requireOrigin = parseBoolean(getEnv("AI_REQUIRE_ORIGIN"), true);

  if (requireOrigin && !requestOrigin) {
    return { ok: false, status: 403, error: "Origin header is required." };
  }

  if (requestOrigin && allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return { ok: false, status: 403, error: "Origin is not allowed for this endpoint." };
  }

  const requireUserAgent = parseBoolean(getEnv("AI_REQUIRE_USER_AGENT"), true);
  const userAgent = String(getHeader(event, "user-agent") || "");
  if (requireUserAgent && !userAgent.trim()) {
    return { ok: false, status: 403, error: "User-Agent header is required." };
  }

  const blockBotUa = parseBoolean(getEnv("AI_BLOCK_BOT_UA"), true);
  const blockedRegexRaw = String(getEnv("AI_BLOCKED_UA_REGEX") || "").trim();
  const blockedRegex = blockedRegexRaw ? new RegExp(blockedRegexRaw, "i") : DEFAULT_BLOCKED_UA_REGEX;
  if (blockBotUa && blockedRegex.test(userAgent)) {
    return { ok: false, status: 403, error: "Automated clients are not allowed on this endpoint." };
  }

  const disableRateLimit = parseBoolean(getEnv("AI_DISABLE_RATE_LIMIT"), false);
  if (!disableRateLimit) {
    const maxRequests = parseNumber(getEnv("AI_RATE_LIMIT_MAX_REQUESTS"), 20);
    const windowMs = parseNumber(getEnv("AI_RATE_LIMIT_WINDOW_MS"), 60_000);
    const clientIp = getClientIp(event);
    const rate = consumeRateLimit({
      key: `${endpoint}:${clientIp}`,
      maxRequests,
      windowMs,
    });

    if (!rate.ok) {
      return {
        ok: false,
        status: 429,
        error: "Too many AI requests. Please try again shortly.",
        retryAfter: rate.retryAfter,
      };
    }
  }

  return { ok: true };
};
