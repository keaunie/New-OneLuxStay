import { fetchWithTimeout } from "./http.js";

const trimTrailingSlash = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const resolveServiceRoleKey = () =>
  String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();

const resolveAnonKey = () =>
  String(
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
  ).trim();

export const getSupabaseConfig = ({ requireServiceRole = true } = {}) => {
  const url = trimTrailingSlash(process.env.SUPABASE_URL || "");
  const serviceRoleKey = resolveServiceRoleKey();
  const anonKey = resolveAnonKey();

  if (!url) {
    throw new Error("Missing SUPABASE_URL");
  }

  if (requireServiceRole && !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
  }

  return { url, serviceRoleKey, anonKey };
};

export const isSupabaseConfigured = ({ requireServiceRole = true } = {}) => {
  try {
    const cfg = getSupabaseConfig({ requireServiceRole });
    if (!cfg.url) return false;
    if (requireServiceRole) return Boolean(cfg.serviceRoleKey);
    return Boolean(cfg.serviceRoleKey || cfg.anonKey);
  } catch {
    return false;
  }
};

export const shouldUseSupabaseProvider = (scope = "") => {
  const globalValue = String(process.env.APP_DATA_PROVIDER || process.env.DATA_PROVIDER || "")
    .trim()
    .toLowerCase();
  const scopeValue = String(process.env[`APP_DATA_PROVIDER_${String(scope || "").toUpperCase()}`] || "")
    .trim()
    .toLowerCase();

  const selected = scopeValue || globalValue;
  if (!selected) return false;
  return ["supabase", "sb", "postgres", "postgresql"].includes(selected);
};

export const buildSupabaseRestUrl = (path, query = {}) => {
  const { url } = getSupabaseConfig({ requireServiceRole: false });
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const target = new URL(`${url}/rest/v1/${normalizedPath}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    target.searchParams.set(key, String(value));
  });

  return target.toString();
};

export const supabaseRestRequest = async (
  path,
  {
    method = "GET",
    query,
    body,
    prefer,
    timeout = 20_000,
    useAnonKey = false,
  } = {},
) => {
  const { serviceRoleKey, anonKey } = getSupabaseConfig({ requireServiceRole: !useAnonKey });
  const authKey = useAnonKey ? anonKey : serviceRoleKey;

  if (!authKey) {
    throw new Error(useAnonKey ? "Missing SUPABASE_ANON_KEY" : "Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const response = await fetchWithTimeout(
    buildSupabaseRestUrl(path, query),
    {
      method,
      headers: {
        apikey: authKey,
        Authorization: `Bearer ${authKey}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    timeout,
  );

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message || payload?.error_description || `Supabase request failed (${response.status})`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const toSupabaseInFilter = (values = []) => {
  const normalized = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!normalized.length) return "";

  // PostgREST expects: in.(a,b,c). Double quotes are needed when values contain punctuation.
  return `(${normalized
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")})`;
};

export const isSupabaseEnforced = () =>
  parseBoolean(process.env.APP_DATA_PROVIDER_ENFORCE || process.env.DATA_PROVIDER_ENFORCE, false);

export const parseEnvBoolean = parseBoolean;
