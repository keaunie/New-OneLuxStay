const LOCAL_FUNCTIONS_BASE = "/.netlify/functions";
const DEFAULT_NETLIFY_SITE_URL = "https://oneluxstayprop.netlify.app";

const normalizeBase = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/index\/?$/, "");

const isRelativeBase = (value) => /^\/(?!\/)/.test(String(value || "").trim());

const configuredApiBase = normalizeBase(import.meta.env.VITE_API_BASE || "");
const configuredNetlifySiteUrl = normalizeBase(
  import.meta.env.VITE_NETLIFY_SITE_URL ||
  import.meta.env.VITE_NETLIFY_FUNCTIONS_ORIGIN ||
  ""
);

const resolvedNetlifySiteUrl = configuredNetlifySiteUrl || DEFAULT_NETLIFY_SITE_URL;
const remoteFunctionsBase = `${resolvedNetlifySiteUrl}/.netlify/functions`;

const isLocalHost =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || "");

const isNetlifyLikeHost =
  typeof window !== "undefined" &&
  /(^|\.)netlify\.app$/i.test(window.location.hostname || "");

const isOneLuxStayDomain =
  typeof window !== "undefined" &&
  /(^|\.)oneluxstay\.com$/i.test(window.location.hostname || "");

const forceRemoteFunctionsBase =
  String(import.meta.env.VITE_FORCE_REMOTE_FUNCTIONS || "").trim().toLowerCase() === "true";

const shouldUseRelativeFunctionsBase =
  !forceRemoteFunctionsBase && (isLocalHost || isNetlifyLikeHost);

// On localhost, keep relative paths so `netlify dev` / local proxies still work.
// On Netlify-hosted domains, prefer same-origin function paths.
// On oneluxstay.com (Hostinger) and other external hosts, force absolute Netlify function endpoints.
let rawApiBase = LOCAL_FUNCTIONS_BASE;

if (configuredApiBase) {
  rawApiBase = isRelativeBase(configuredApiBase)
    ? shouldUseRelativeFunctionsBase
      ? configuredApiBase
      : `${resolvedNetlifySiteUrl}${configuredApiBase}`
    : configuredApiBase;
} else {
  rawApiBase = shouldUseRelativeFunctionsBase ? LOCAL_FUNCTIONS_BASE : remoteFunctionsBase;
}

export const apiBase = normalizeBase(rawApiBase);
export default apiBase;
