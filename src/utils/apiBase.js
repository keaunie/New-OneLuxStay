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

// On localhost, keep relative paths so `netlify dev` / local proxies still work.
// On external hosts (Hostinger), force absolute Netlify function endpoints.
const rawApiBase = isLocalHost
  ? LOCAL_FUNCTIONS_BASE
  : configuredApiBase
    ? (isRelativeBase(configuredApiBase) ? remoteFunctionsBase : configuredApiBase)
    : remoteFunctionsBase;

export const apiBase = normalizeBase(rawApiBase);
export default apiBase;
